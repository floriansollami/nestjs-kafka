declare module 'kafkajs-snappy' {
  interface Encoder {
    buffer: Buffer;
  }

  export interface SnappyModule {
    /**
     * Compresses the provided encoder's buffer.
     * @param encoder - An object containing the buffer to compress.
     * @returns A promise that resolves to the compressed Buffer.
     */
    compress(encoder: Encoder): Promise<Buffer>;

    /**
     * Decompresses the provided buffer.
     * @param buffer - The Buffer to decompress.
     * @returns A promise that resolves to the decompressed Buffer.
     */
    decompress(buffer: Buffer): Promise<Buffer>;
  }

  /**
   * Creates and returns an instance of the SnappyModule.
   * @returns An object containing compress and decompress methods.
   */
  function createSnappy(): SnappyModule;

  export = createSnappy;
}
