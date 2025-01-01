export type Encoder = {
  buffer: Buffer;
};

export interface Codec {
  compress: (encoder: Encoder) => Promise<Buffer>;
  decompress: (compressed: Buffer) => Promise<Buffer>;
}
