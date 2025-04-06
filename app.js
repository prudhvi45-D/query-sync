require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const flash = require('connect-flash');
const nodemailer = require('nodemailer');
const methodOverride = require('method-override');

// Import models
const Student = require('./models/Student');
const Alumni = require('./models/Alumni');
const Event = require('./models/Event');
const Query = require('./models/Query');

const app = express();

// Add method-override middleware
app.use(methodOverride('_method'));

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer and Cloudinary storage configuration
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'query-sync',
        allowed_formats: ['jpg', 'jpeg', 'png']
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: true,
    saveUninitialized: true,
    store: MongoStore.create({ 
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60 // 24 hours
    }),
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
passport.use('student', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const student = await Student.findOne({ email });
        if (!student) {
            return done(null, false, { message: 'Invalid email or password' });
        }
        const isMatch = await student.comparePassword(password);
        if (!isMatch) {
            return done(null, false, { message: 'Invalid email or password' });
        }
        return done(null, student);
    } catch (err) {
        return done(err);
    }
}));

passport.use('alumni', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const alumni = await Alumni.findOne({ email });
        if (!alumni) {
            return done(null, false, { message: 'Invalid email or password' });
        }
        const isMatch = await alumni.comparePassword(password);
        if (!isMatch) {
            return done(null, false, { message: 'Invalid email or password' });
        }
        return done(null, alumni);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, { id: user._id, type: user instanceof Student ? 'student' : 'alumni' });
});

passport.deserializeUser(async (data, done) => {
    try {
        const user = data.type === 'student' 
            ? await Student.findById(data.id)
            : await Alumni.findById(data.id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('error_msg', 'Please login to view this page');
    res.redirect('/login');
};

// View engine setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');

// Custom middleware to set user variables
app.use((req, res, next) => {
    if (req.user) {
        if (req.user instanceof Student) {
            res.locals.student = req.user;
        } else if (req.user instanceof Alumni) {
            res.locals.alumni = req.user;
        }
    }
    next();
});

// Flash messages middleware
app.use(flash());

// Global variables middleware
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.student = req.user;
    res.locals.alumni = req.user;
    next();
});

// Add nodemailer for email notifications
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Home',
        student: res.locals.student,
        alumni: res.locals.alumni
    });
});

app.get('/login', (req, res) => {
    res.render('login', { 
        student: res.locals.student,
        alumni: res.locals.alumni
    });
});

app.get('/register', (req, res) => {
    res.render('register', { 
        student: res.locals.student,
        alumni: res.locals.alumni
    });
});

app.post('/register', upload.single('profilePicture'), async (req, res) => {
    try {
        console.log('Registration attempt with data:', req.body);
        
        const { username, email, password, userType, bio, skills } = req.body;
        
        // Check if user already exists in either Student or Alumni collection
        const existingStudent = await Student.findOne({ email });
        const existingAlumni = await Alumni.findOne({ email });
        
        if (existingStudent || existingAlumni) {
            console.log('Email already exists:', email);
            req.flash('error_msg', 'Email already registered');
            return res.redirect('/register');
        }

        // Handle profile picture upload
        let profilePicture = null;
        if (req.file) {
            profilePicture = req.file.path;
            console.log('Profile picture uploaded:', profilePicture);
        }

        // Process skills array
        const skillsArray = skills ? skills.split(',').map(skill => skill.trim()) : [];

        if (userType === 'student') {
            const { yearOfStudy, interests, department } = req.body;
            const interestsArray = interests ? interests.split(',').map(interest => interest.trim()) : [];

            // Ensure department is a single string value
            const departmentValue = Array.isArray(department) ? department[1] : department;

            const student = new Student({
                username,
                email,
                password, // The password will be hashed by the pre-save middleware
                profilePicture,
                bio,
                skills: skillsArray,
                yearOfStudy,
                department: departmentValue,
                interests: interestsArray
            });

            await student.save(); // This will trigger the pre-save middleware
            console.log('Student saved successfully:', student._id);
            req.flash('success_msg', 'Student registration successful! Please login.');
        } else if (userType === 'alumni') {
            const { graduationYear, currentPosition, company, experience, expertise, linkedInUrl, department } = req.body;
            const expertiseArray = expertise ? expertise.split(',').map(item => item.trim()) : [];

            // Ensure department is a single string value
            const departmentValue = Array.isArray(department) ? department[1] : department;

            console.log('Creating alumni with data:', {
                username,
                email,
                graduationYear,
                department: departmentValue,
                currentPosition,
                company,
                experience,
                expertise: expertiseArray,
                linkedInUrl
            });

            const alumni = new Alumni({
                username,
                email,
                password, // The password will be hashed by the pre-save middleware
                profilePicture,
                bio,
                skills: skillsArray,
                graduationYear,
                department: departmentValue,
                currentPosition,
                company,
                experience,
                expertise: expertiseArray,
                linkedInUrl
            });

            await alumni.save(); // This will trigger the pre-save middleware
            console.log('Alumni saved successfully:', alumni._id);
            req.flash('success_msg', 'Alumni registration successful! Please login.');
        } else {
            console.log('Invalid user type:', userType);
            req.flash('error_msg', 'Invalid user type selected');
            return res.redirect('/register');
        }

        res.redirect('/login');
    } catch (err) {
        console.error('Registration error:', err);
        console.error('Error stack:', err.stack);
        req.flash('error_msg', `Registration failed: ${err.message}`);
        res.redirect('/register');
    }
});

app.post('/login', (req, res, next) => {
    console.log('Login attempt with:', {
        email: req.body.email,
        hasPassword: !!req.body.password,
        userType: req.body.userType
    });

    // Validate required fields
    if (!req.body.email || !req.body.password || !req.body.userType) {
        req.flash('error_msg', 'Please provide email, password, and select user type');
        return res.redirect('/login');
    }

    // Create a custom authenticate callback
    const authenticateUser = async (err, user, info) => {
        if (err) {
            console.error('Authentication error:', err);
            return next(err);
        }
        if (!user) {
            console.log('Authentication failed:', info);
            req.flash('error_msg', info.message || 'Invalid email or password');
            return res.redirect('/login');
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return next(err);
            }
            console.log('User logged in successfully:', user._id);
            req.flash('success_msg', 'You are now logged in');
            return res.redirect('/dashboard');
        });
    };

    // Use the appropriate strategy based on user type
    if (req.body.userType === 'student') {
        passport.authenticate('student', authenticateUser)(req, res, next);
    } else if (req.body.userType === 'alumni') {
        passport.authenticate('alumni', authenticateUser)(req, res, next);
    } else {
        req.flash('error_msg', 'Invalid user type selected');
        return res.redirect('/login');
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.user) {
        req.flash('error_msg', 'Please login to view dashboard');
        return res.redirect('/login');
    }
    res.redirect('/profile');
});

app.get('/events', async (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }

    try {
        // Get all events with organizer populated
        const events = await Event.find()
            .populate('organizer', 'username profilePicture')
            .sort({ date: 1 });

        // Prepare flash messages
        const flashMessages = [];
        if (req.flash('success_msg').length > 0) {
            flashMessages.push({
                type: 'success',
                message: req.flash('success_msg')[0]
            });
        }
        if (req.flash('error_msg').length > 0) {
            flashMessages.push({
                type: 'danger',
                message: req.flash('error_msg')[0]
            });
        }

        res.render('events', { 
            events: events || [],
            currentUser: req.user,
            student: res.locals.student,
            alumni: res.locals.alumni,
            flashMessages: flashMessages
        });
    } catch (err) {
        console.error('Error loading events:', err);
        req.flash('error_msg', 'Error loading events');
        res.redirect('/');
    }
});

app.post('/events', upload.single('image'), async (req, res) => {
    if (!req.user || !(req.user instanceof Alumni)) {
        req.flash('error_msg', 'Only alumni can create events');
        return res.redirect('/events');
    }

    try {
        const { title, description, date, time, registrationLink, eventType, tags } = req.body;

        // Validate required fields
        if (!title || !description || !date || !time || !registrationLink || !eventType || !req.file) {
            req.flash('error_msg', 'All fields are required');
            return res.redirect('/events');
        }

        // Create new event
        const event = new Event({
            title,
            description,
            image: req.file.path, // Cloudinary path
            date: new Date(date),
            time,
            registrationLink,
            eventType,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            organizer: req.user._id
        });

        await event.save();

        req.flash('success_msg', 'Event created successfully');
        res.redirect('/events');
    } catch (err) {
        console.error('Error creating event:', err);
        req.flash('error_msg', 'Error creating event: ' + err.message);
        res.redirect('/events');
    }
});

app.get('/network', isAuthenticated, async (req, res) => {
    try {
        const alumni = await Alumni.find()
            .select('username profilePicture bio skills department currentPosition company experience expertise linkedInUrl graduationYear')
            .lean();

        const users = alumni.map(alumni => ({
            ...alumni,
            role: 'alumni'
        }));

        res.render('network', { 
            users,
            currentUser: req.user,
            title: 'Network'
        });
    } catch (error) {
        console.error('Error fetching alumni:', error);
        res.status(500).send('Error fetching alumni');
    }
});

// Add cleanup function for expired queries
const cleanupExpiredQueries = async () => {
    try {
        const expiredQueries = await Query.find({ expiresAt: { $lt: new Date() } });
        
        for (const query of expiredQueries) {
            // Remove query from student's questionsAsked array
            await Student.findByIdAndUpdate(
                query.author,
                { $pull: { questionsAsked: query._id } }
            );
            
            // Delete the query
            await query.deleteOne();
        }
    } catch (err) {
        console.error('Error cleaning up expired queries:', err);
    }
};

// Run cleanup every hour
setInterval(cleanupExpiredQueries, 60 * 60 * 1000);

// Update the queries route
app.get('/queries', async (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }

    try {
        console.log('Fetching queries for user:', req.user._id);
        console.log('User type:', req.user instanceof Student ? 'Student' : 'Alumni');

        // Get all queries with author and answers populated
        const queries = await Query.find()
            .populate('author', 'username profilePicture')
            .populate({
                path: 'answers',
                populate: {
                    path: 'author',
                    select: 'username profilePicture'
                }
            })
            .sort({ createdAt: -1 });

        // Calculate remaining time for each query
        const queriesWithTimer = queries.map(query => {
            const now = new Date();
            const expiresAt = new Date(query.expiresAt);
            const timeRemaining = expiresAt - now;
            
            // Ensure we have valid dates
            if (isNaN(timeRemaining)) {
                console.error('Invalid date for query:', query._id);
                return {
                    ...query.toObject(),
                    timeRemaining: {
                        days: 0,
                        hours: 0,
                        minutes: 0,
                        seconds: 0,
                        total: 0,
                        formatted: '0d 0h 0m 0s'
                    }
                };
            }
            
            // Calculate days, hours, minutes, seconds
            const days = Math.max(0, Math.floor(Math.abs(timeRemaining) / (1000 * 60 * 60 * 24)));
            const hours = Math.max(0, Math.floor((Math.abs(timeRemaining) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
            const minutes = Math.max(0, Math.floor((Math.abs(timeRemaining) % (1000 * 60 * 60)) / (1000 * 60)));
            const seconds = Math.max(0, Math.floor((Math.abs(timeRemaining) % (1000 * 60)) / 1000));
            
            // Format the time string with padding
            const formatted = `${days.toString().padStart(2, '0')}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
            
            return {
                ...query.toObject(),
                timeRemaining: {
                    days,
                    hours,
                    minutes,
                    seconds,
                    total: timeRemaining,
                    formatted
                }
            };
        });

        // Initialize userQueries as an empty array
        let userQueries = [];

        // Set student and alumni variables based on user type
        const isStudent = req.user instanceof Student;
        const isAlumni = !isStudent;

        // If user is a student, get their questions
        if (isStudent) {
            console.log('User is a student, fetching their questions');
            const student = await Student.findById(req.user._id)
                .populate({
                    path: 'questionsAsked',
                    populate: {
                        path: 'answers',
                        populate: {
                            path: 'author',
                            select: 'username profilePicture'
                        }
                    }
                });
            
            userQueries = student.questionsAsked || [];
        }

        res.render('queries', { 
            queries: queriesWithTimer,
            userQueries: userQueries,
            currentUser: req.user,
            student: isStudent ? req.user : null,
            alumni: isAlumni ? req.user : null,
            flashMessages: res.locals.flashMessages
        });
    } catch (err) {
        console.error('Error loading queries:', err);
        req.flash('error_msg', 'Error loading queries');
        res.redirect('/');
    }
});

app.post('/queries', async (req, res) => {
    if (!req.user || !(req.user instanceof Student)) {
        req.flash('error_msg', 'Only students can post questions');
        return res.redirect('/queries');
    }

    try {
        const { title, description, tags } = req.body;
        
        // Create new query
        const query = new Query({
            title,
            description,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            author: req.user._id
        });

        // Save the query
        await query.save();

        // Add query ID to student's questionsAsked array
        await Student.findByIdAndUpdate(
            req.user._id,
            { $push: { questionsAsked: query._id } }
        );

        req.flash('success_msg', 'Question posted successfully');
        res.redirect('/queries');
    } catch (err) {
        console.error('Error posting query:', err);
        req.flash('error_msg', 'Error posting question');
        res.redirect('/queries');
    }
});

app.post('/queries/:id/answers', async (req, res) => {
    if (!req.user || !(req.user instanceof Alumni)) {
        req.flash('error_msg', 'Only alumni can answer questions');
        return res.redirect('/queries');
    }

    try {
        const query = await Query.findById(req.params.id)
            .populate('author', 'email username');

        if (!query) {
            req.flash('error_msg', 'Question not found');
            return res.redirect('/queries');
        }

        // Create new answer
        const answer = {
            content: req.body.content,
            author: req.user._id,
            createdAt: new Date()
        };

        // Add answer to query
        query.answers.push(answer);
        await query.save();

        // Send email notification to student
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: query.author.email,
            subject: 'New Answer to Your Question',
            html: `
                <h2>New Answer to Your Question</h2>
                <p>Hello ${query.author.username},</p>
                <p>An alumni has answered your question: "${query.title}"</p>
                <p>Question: ${query.description}</p>
                <p>Answer: ${req.body.content}</p>
                <p>You can view the full answer by logging into your account.</p>
                <p>Best regards,<br>QuerySync Team</p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
            } else {
                console.log('Email sent:', info.response);
            }
        });

        req.flash('success_msg', 'Answer posted successfully');
        res.redirect('/queries');
    } catch (err) {
        console.error('Error posting answer:', err);
        req.flash('error_msg', 'Error posting answer');
        res.redirect('/queries');
    }
});

// Edit Query Route
app.put('/queries/:id', async (req, res) => {
    console.log('PUT request received for query:', req.params.id);
    console.log('Request body:', req.body);
    console.log('Request method:', req.method);
    console.log('Original method:', req.originalMethod);

    if (!req.user) {
        req.flash('error_msg', 'Please login to edit queries');
        return res.redirect('/login');
    }

    try {
        const query = await Query.findById(req.params.id);
        
        if (!query) {
            req.flash('error_msg', 'Query not found');
            return res.redirect('/queries');
        }

        // Check if the current user is the author of the query
        if (query.author.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'You are not authorized to edit this query');
            return res.redirect('/queries');
        }

        const { title, description, tags } = req.body;

        // Update the query
        query.title = title;
        query.description = description;
        query.tags = tags ? tags.split(',').map(tag => tag.trim()) : [];
        query.updatedAt = new Date();

        await query.save();

        req.flash('success_msg', 'Query updated successfully');
        res.redirect('/queries');
    } catch (err) {
        console.error('Error updating query:', err);
        req.flash('error_msg', 'Error updating query');
        res.redirect('/queries');
    }
});

// Delete Query Route
app.delete('/queries/:id', async (req, res) => {
    console.log('DELETE request received for query:', req.params.id);
    console.log('Request method:', req.method);
    console.log('Original method:', req.originalMethod);

    if (!req.user) {
        req.flash('error_msg', 'Please login to delete queries');
        return res.redirect('/login');
    }

    try {
        const query = await Query.findById(req.params.id);
        
        if (!query) {
            req.flash('error_msg', 'Query not found');
            return res.redirect('/queries');
        }

        // Check if the current user is the author of the query
        if (query.author.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'You are not authorized to delete this query');
            return res.redirect('/queries');
        }

        // Remove query from student's questionsAsked array if user is a student
        if (req.user instanceof Student) {
            await Student.findByIdAndUpdate(
                req.user._id,
                { $pull: { questionsAsked: query._id } }
            );
        }

        // Delete the query
        await query.deleteOne();

        req.flash('success_msg', 'Query deleted successfully');
        res.redirect('/queries');
    } catch (err) {
        console.error('Error deleting query:', err);
        req.flash('error_msg', 'Error deleting query');
        res.redirect('/queries');
    }
});

app.get('/profile', async (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }
    try {
        // Get the current user's full information from the database
        let user;
        if (req.user instanceof Student) {
            user = await Student.findById(req.user._id);
            res.locals.student = user;
            res.locals.alumni = null;
        } else {
            user = await Alumni.findById(req.user._id);
            res.locals.student = null;
            res.locals.alumni = user;
        }

        res.render('profile', { 
            user: user,
            student: res.locals.student,
            alumni: res.locals.alumni
        });
    } catch (err) {
        console.error('Error loading profile:', err);
        req.flash('error_msg', 'Error loading profile');
        res.redirect('/');
    }
});

app.get('/profile/edit', async (req, res) => {
    if (!req.user) {
        req.flash('error_msg', 'Please login to edit your profile');
        return res.redirect('/login');
    }
    try {
        // Get the current user's full information from the database
        let user;
        if (req.user instanceof Student) {
            user = await Student.findById(req.user._id);
            res.locals.student = user;
            res.locals.alumni = null;
        } else {
            user = await Alumni.findById(req.user._id);
            res.locals.student = null;
            res.locals.alumni = user;
        }

        res.render('profile-edit', { 
            user: user,
            student: res.locals.student,
            alumni: res.locals.alumni,
            title: 'Edit Profile'
        });
    } catch (err) {
        console.error('Error loading profile edit page:', err);
        req.flash('error_msg', 'Error loading profile edit page');
        res.redirect('/profile');
    }
});

app.post('/profile', upload.single('profilePicture'), async (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }
    try {
        const { 
            username, 
            email, 
            bio, 
            skills, 
            interests, 
            year, 
            rollNumber, 
            graduationYear, 
            currentPosition, 
            company,
            department,
            expertise,
            linkedInUrl,
            experience 
        } = req.body;

        console.log('Received profile update data:', req.body);

        // Basic validation
        if (!username || !email) {
            req.flash('error_msg', 'Username and email are required');
            return res.redirect('/profile/edit');
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            req.flash('error_msg', 'Please enter a valid email address');
            return res.redirect('/profile/edit');
        }

        // Check if email is already taken by another user
        let existingUser;
        if (req.user instanceof Student) {
            existingUser = await Student.findOne({ email, _id: { $ne: req.user._id } });
        } else {
            existingUser = await Alumni.findOne({ email, _id: { $ne: req.user._id } });
        }

        if (existingUser) {
            req.flash('error_msg', 'Email is already taken');
            return res.redirect('/profile/edit');
        }

        // Prepare update object with common fields
        const updateData = {
            username,
            email,
            bio: bio || '',
            department: department || '',
            skills: typeof skills === 'string' ? skills.split(',').map(skill => skill.trim()).filter(Boolean) : [],
            interests: typeof interests === 'string' ? interests.split(',').map(interest => interest.trim()).filter(Boolean) : []
        };

        // Add profile picture if uploaded
        if (req.file) {
            // Delete old profile picture from Cloudinary if exists
            if (req.user.profilePicture && req.user.profilePicture.includes('cloudinary')) {
                try {
                    const publicId = req.user.profilePicture.split('/').pop().split('.')[0];
                    await cloudinary.uploader.destroy(publicId);
                } catch (error) {
                    console.error('Error deleting old profile picture:', error);
                }
            }
            updateData.profilePicture = req.file.path;
        }

        let updatedUser;

        // Add user-type specific fields and validation
        if (req.user instanceof Student) {
            // Student-specific validation
            if (year && (isNaN(year) || year < 1 || year > 5)) {
                req.flash('error_msg', 'Year must be between 1 and 5');
                return res.redirect('/profile/edit');
            }

            // Validate department
            if (!department) {
                req.flash('error_msg', 'Department is required');
                return res.redirect('/profile/edit');
            }

            // Update student-specific fields
            Object.assign(updateData, {
                year: year ? parseInt(year) : undefined,
                rollNumber: rollNumber || undefined,
                department: department
            });

            // Update the student document
            updatedUser = await Student.findByIdAndUpdate(
                req.user._id,
                { $set: updateData },
                { new: true, runValidators: true }
            );

            // Update session user data
            req.user = updatedUser;
            res.locals.student = updatedUser;
            res.locals.alumni = null;
        } else {
            // Alumni-specific validation
            if (graduationYear && (isNaN(graduationYear) || graduationYear < 1950 || graduationYear > new Date().getFullYear())) {
                req.flash('error_msg', 'Please enter a valid graduation year');
                return res.redirect('/profile/edit');
            }

            // Update alumni-specific fields
            Object.assign(updateData, {
                graduationYear: graduationYear ? parseInt(graduationYear) : undefined,
                currentPosition: currentPosition || '',
                company: company || '',
                expertise: typeof expertise === 'string' ? expertise.split(',').map(exp => exp.trim()).filter(Boolean) : [],
                linkedInUrl: linkedInUrl || '',
                experience: experience || ''
            });

            // Update the alumni document
            updatedUser = await Alumni.findByIdAndUpdate(
                req.user._id,
                { $set: updateData },
                { new: true, runValidators: true }
            );

            // Update session user data
            req.user = updatedUser;
            res.locals.student = null;
            res.locals.alumni = updatedUser;
        }

        console.log('Updated user data:', updatedUser);

        // Handle AJAX requests
        if (req.xhr) {
            return res.json({ 
                success: true, 
                message: 'Profile updated successfully',
                user: updatedUser 
            });
        }

        req.flash('success_msg', 'Profile updated successfully');
        return res.redirect('/profile');
    } catch (err) {
        console.error('Error updating profile:', err);

        // Handle specific validation errors
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(error => error.message);
            req.flash('error_msg', messages.join(', '));
        } else {
            req.flash('error_msg', 'Error updating profile: ' + err.message);
        }

        // Handle AJAX requests
        if (req.xhr) {
            return res.status(400).json({ 
                success: false, 
                message: 'Error updating profile',
                errors: err.message 
            });
        }

        return res.redirect('/profile/edit');
    }
});

// Logout route - handle both GET and POST
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).send('Error during logout');
        }
        req.flash('success_msg', 'You have been logged out successfully');
        res.redirect('/login');
    });
});

app.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).send('Error during logout');
        }
        req.flash('success_msg', 'You have been logged out successfully');
        res.redirect('/login');
    });
});

// Add this route for testing purposes
app.get('/test/events', async (req, res) => {
    try {
        // Create some test events
        const events = [
            {
                title: 'Career Workshop',
                description: 'Learn about career opportunities in tech',
                date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                location: 'Virtual',
                organizer: req.user._id,
                organizerType: 'Alumni',
                maxAttendees: 50,
                tags: ['career', 'workshop', 'tech']
            },
            {
                title: 'Networking Session',
                description: 'Connect with industry professionals',
                date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
                location: 'Campus Hall',
                organizer: req.user._id,
                organizerType: 'Alumni',
                maxAttendees: 30,
                tags: ['networking', 'career']
            }
        ];

        // Save events to database
        for (const eventData of events) {
            const event = new Event(eventData);
            await event.save();
        }

        res.send('Test events created successfully');
    } catch (err) {
        console.error('Error creating test events:', err);
        res.status(500).send('Error creating test events');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 