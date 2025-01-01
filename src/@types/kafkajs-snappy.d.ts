declare module 'kafkajs-snappy' {
  interface SnappyCodec {
    compress(encoder: { buffer: Buffer }): Promise<Buffer>;
    decompress(buffer: Buffer): Promise<Buffer>;
  }

  function createSnappyCodec(): SnappyCodec;

  export = createSnappyCodec;
}
