const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema({
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
    yearOfStudy: {
        type: Number,
        required: true,
        min: 1,
        max: 5
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
    interests: [{
        type: String,
        trim: true
    }],
    questionsAsked: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Query'
    }]
}, {
    timestamps: true
});

// Hash password before saving
studentSchema.pre('save', async function(next) {
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
studentSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Student', studentSchema); 