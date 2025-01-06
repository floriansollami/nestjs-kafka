import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKafkaCodec } from '../../src/compression/codecs.js';

const mocks = vi.hoisted(() => {
  return {
    lz4: {
      mockDecode: vi.fn().mockReturnValue(Buffer.from('lz4-decompressed')),
      mockEncode: vi.fn().mockReturnValue(Buffer.from('lz4-compressed')),
    },
    snappy: {
      mockCompress: vi.fn(),
      mockDecompress: vi.fn(),
    },
    zstd: {
      mockCompress: vi.fn().mockReturnValue(Buffer.from('zstd-compressed')),
      mockDecompress: vi.fn().mockReturnValue(Buffer.from('zstd-decompressed')),
    },
  };
});

vi.mock('lz4', () => ({
  decode: mocks.lz4.mockDecode,
  encode: mocks.lz4.mockEncode,
}));

vi.mock('kafkajs-snappy', () => ({
  // it uses a module.exports which is a default export
  default: vi.fn(() => ({
    compress: mocks.snappy.mockCompress,
    decompress: mocks.snappy.mockDecompress,
  })),
}));

vi.mock('@hpcc-js/wasm-zstd', () => ({
  Zstd: {
    load: vi.fn().mockResolvedValue({
      compress: mocks.zstd.mockCompress,
      decompress: mocks.zstd.mockDecompress,
    }),
  },
}));

describe('createKafkaCodec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LZ4', () => {
    it('should call compress with the correct arguments and return a Buffer', async () => {
      const codec = await createKafkaCodec('LZ4');

      const buffer = Buffer.from('input-to-compress');
      const result = await codec.compress({ buffer });

      expect(mocks.lz4.mockEncode).toHaveBeenCalledWith(buffer);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.equals(Buffer.from('lz4-compressed'))).toBe(true);
    });

    it('should call decompress with the correct arguments and return a Buffer', async () => {
      const codec = await createKafkaCodec('LZ4');

      const buffer = Buffer.from('input-to-decompress');
      const result = await codec.decompress(buffer);

      expect(mocks.lz4.mockDecode).toHaveBeenCalledWith(buffer);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.equals(Buffer.from('lz4-decompressed'))).toBe(true);
    });
  });

  describe('SNAPPY', () => {
    it('should return an object with compress and decompress methods', async () => {
      const codec = await createKafkaCodec('SNAPPY');

      expect(codec).toHaveProperty('compress');
      expect(codec).toHaveProperty('decompress');
      expect(typeof codec.compress).toBe('function');
      expect(typeof codec.decompress).toBe('function');
    });

    it('should call compress with the correct arguments', async () => {
      const codec = await createKafkaCodec('SNAPPY');

      const buffer = Buffer.from('input-to-compress');
      await codec.compress({ buffer });

      expect(mocks.snappy.mockCompress).toHaveBeenCalledWith({ buffer });
    });

    it('should call decompress with the correct arguments', async () => {
      const codec = await createKafkaCodec('SNAPPY');

      const buffer = Buffer.from('input-to-decompress');
      await codec.decompress(buffer);

      expect(mocks.snappy.mockDecompress).toHaveBeenCalledWith(buffer);
    });
  });

  describe('ZSTD', () => {
    beforeEach(() => {
      // Resetting modules and re-importing them, ensure that zstdInstance starts as null in every test.
      vi.resetModules();
    });

    it('should call compress with the correct arguments and return a Buffer', async () => {
      const { createKafkaCodec } = await import('../../src/compression/codecs.js');
      const codec = await createKafkaCodec('ZSTD');

      const buffer = Buffer.from('input');
      const result = await codec.compress({ buffer });

      expect(mocks.zstd.mockCompress).toHaveBeenCalledWith(buffer);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should call decompress with the correct arguments and return a Buffer', async () => {
      const { createKafkaCodec } = await import('../../src/compression/codecs.js');
      const codec = await createKafkaCodec('ZSTD');

      const buffer = Buffer.from('input');
      const result = await codec.decompress(buffer);

      expect(mocks.zstd.mockDecompress).toHaveBeenCalledWith(buffer);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should throw an error if Zstd is already loaded', async () => {
      const { createKafkaCodec } = await import('../../src/compression/codecs.js');

      await createKafkaCodec('ZSTD');

      const { createKafkaCodec: createKafkaCodec2 } = await import('../../src/compression/codecs.js');

      await expect(createKafkaCodec2('ZSTD')).rejects.toThrow('Zstd instance is already loaded.');
    });
  });

  describe('Default Case', () => {
    it('should throw an error for unsupported codec type', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(createKafkaCodec('INVALID_CODEC' as any)).rejects.toThrow('Unsupported codec: INVALID_CODEC');
    });
  });
});
