// Capture mono PCM at 24 kHz regardless of the browser's audio device rate.
// An area-average resampler retains fractional positions across render blocks.
class TranscriptionCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.width = sampleRate / 24000;
    this.remaining = this.width;
    this.sum = 0;
    this.samples = [];
    this.stopped = false;
    this.port.onmessage = ({data}) => {
      if (data === 'flush') {
        this.stopped = true;
        this.emit();
        this.port.postMessage('flushed');
      }
    };
  }
  emit() {
    if (!this.samples.length) return;
    const bytes = new ArrayBuffer(this.samples.length * 2);
    const view = new DataView(bytes);
    this.samples.forEach((v, i) => view.setInt16(i * 2, v, true));
    this.samples = [];
    this.port.postMessage(bytes, [bytes]);
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      let available = 1;
      while (available > 1e-9) {
        const take = Math.min(available, this.remaining);
        this.sum += value * take;
        this.remaining -= take;
        available -= take;
        if (this.remaining < 1e-9) {
          const sample = Math.max(-1, Math.min(1, this.sum / this.width));
          this.samples.push(Math.round(sample * (sample < 0 ? 32768 : 32767)));
          this.sum = 0;
          this.remaining = this.width;
          if (this.samples.length === 2400) this.emit();
        }
      }
    }
    return true;
  }
}
registerProcessor('transcription-capture', TranscriptionCapture);
