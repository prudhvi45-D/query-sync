const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    registrationLink: {
        type: String,
        required: true
    },
    eventType: {
        type: String,
        required: true,
        enum: ['Workshop', 'Seminar', 'Conference', 'Networking', 'Career Fair', 'Other']
    },
    tags: [{
        type: String,
        trim: true
    }],
    organizer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Alumni',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
eventSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Add text index for search functionality
eventSchema.index({ title: 'text', description: 'text', tags: 'text' });

const Event = mongoose.model('Event', eventSchema);

module.exports = Event; 