const mongoose = require('mongoose');

const { Schema } = mongoose;

/*
 * rrweb sends a stream of DOM-mutation/interaction events. We batch them
 * client-side and store each batch as one document (rather than one row per
 * rrweb event) to keep write volume sane. The admin session-replay player
 * concatenates a session's chunks in order and feeds them to rrweb-player.
 *
 * Input fields (values typed into <input>/<textarea>) are masked at the
 * point of `rrweb.record()` on the client via maskAllInputs — see
 * signal-main/index.html. This isn't just a size limit, it's the whole
 * point: replay is for *behavior*, not for capturing what people typed.
 */
const ReplayChunkSchema = new Schema({
  sessionId: { type: String, required: true, index: true, maxlength: 100 },
  seq: { type: Number, required: true },
  path: { type: String, maxlength: 300 },

  // Raw rrweb event array for this batch. Capped at the route level
  // (see src/routes/replay.js) before it ever reaches here.
  events: { type: Schema.Types.Mixed, required: true },

  startedAt: { type: Number }, // ms epoch of first event in batch
  endedAt: { type: Number }, // ms epoch of last event in batch

  createdAt: { type: Date, default: Date.now, index: true },
});

ReplayChunkSchema.index({ sessionId: 1, seq: 1 }, { unique: true });

module.exports = mongoose.model('ReplayChunk', ReplayChunkSchema);
