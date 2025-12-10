const mongoose = require('mongoose');

const MatchRequestSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  mode: { type: String, enum: ['practice', 'pvp'], default: 'pvp' },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'], default: 'pending' },
  message: { type: String },
  expiresAt: { type: Date },
}, { timestamps: true });

MatchRequestSchema.index({ requester: 1, recipient: 1, status: 1 });

module.exports = mongoose.model('MatchRequest', MatchRequestSchema);