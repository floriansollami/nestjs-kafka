import { KafkaJSONSerializer } from './kafka-json.serializer';

describe('KafkaJSONSerializer', () => {
  describe('serialize', () => {
    it('should return the Buffer as it is when value is a Buffer', async () => {
      const input = Buffer.from('test buffer');
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe(input);
    });

    it('should return a JSON string when value is an object', async () => {
      const input = { a: 1, b: 'two', c: true };
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe('{"a":1,"b":"two","c":true}');
    });

    it('should return an empty JSON object for prototype-less objects', async () => {
      const input = Object.create(null); // create an object without a prototype
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe('{}');
    });

    it('should return a JSON string when value is an array', async () => {
      const input = [1, 'two', true];
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe('[1,"two",true]');
    });

    it('should return the same string when value is a string', async () => {
      const input = 'test string';
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe('test string');
    });

    it('should return a string when value is a number', async () => {
      const input = 123;
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe('123');
    });

    it('should return a string when value is a boolean', async () => {
      const input = true;
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe('true');
    });

    it('should return the functions toString result when value is a function', async () => {
      const input = function test(): string {
        return 'Hello';
      };
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe(input.toString());
    });

    it('should handle Symbol by converting it to a string', async () => {
      const input = Symbol('test');
      const output = await new KafkaJSONSerializer().serialize(input);
      expect(output).toBe('Symbol(test)');
    });
  });
});
