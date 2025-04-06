const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const alumniSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    profilePicture: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        default: ''
    },
    skills: [{
        type: String,
        trim: true
    }],
    graduationYear: {
        type: Number,
        required: true,
        min: 2000,
        max: new Date().getFullYear()
    },
    department: {
        type: String,
        required: true,
        enum: [
            'Computer Science',
            'Information Technology',
            'Electrical Engineering',
            'Mechanical Engineering',
            'Civil Engineering',
            'Chemical Engineering'
        ]
    },
    currentPosition: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        required: true,
        trim: true
    },
    experience: {
        type: Number,
        required: true,
        min: 0
    },
    expertise: [{
        type: String,
        trim: true
    }],
    linkedInUrl: {
        type: String,
        trim: true,
        match: [/^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?$/, 'Please enter a valid LinkedIn profile URL']
    },
    questionsAnswered: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Query'
    }]
}, {
    timestamps: true
});

// Hash password before saving
alumniSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Method to compare password
alumniSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const Alumni = mongoose.model('Alumni', alumniSchema);

module.exports = Alumni; 