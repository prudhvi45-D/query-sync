const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Alumni',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const querySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    answers: [answerSchema],
    status: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from creation
    }
});

// Update the updatedAt field before saving
querySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Add text index for search functionality
querySchema.index({ title: 'text', description: 'text', tags: 'text' });

const Query = mongoose.model('Query', querySchema);

module.exports = Query; 