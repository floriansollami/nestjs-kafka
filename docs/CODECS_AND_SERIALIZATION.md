# Codec: Coder-Decoder

Codec is a short name for coder-decoder, which hints at the process of encoding to and decoding from.

## Serialization and Deserialization

### Serialization

Serialization is a specific type of encoding where complex data types (like objects, data structures) are converted into a format that can be easily stored or transmitted (like JSON, XML, or binary formats). The goal here is to "flatten" the data into a string or a byte stream that can be reconstructed later.

Our `KafkaJSONSerializer` is designed to handle this process effectively. It ensures that data is encoded in a way that can be easily stored or transmitted, typically by converting objects and arrays into JSON strings. For headers, KafkaJS automatically serializes header values to Buffers, so sending them as strings is sufficient.

Our `KafkaAvroSerializer` is a specialized serializer that uses Avro schemas in conjunction with the Confluent Schema Registry. The primary purpose of this serializer is to serialize an object using Avro, which offers several benefits such as efficient serialization, schema evolution support, and strong data typing.

Our `KafkaVoidSerializer` is a minimalist serializer designed to ignore any incoming data and produce no serialized output

### Deserialization

Deserialization is the reverse process of serialization. It involves taking the serialized string or byte stream and reconstructing the original data structures from it.

Our `KafkaStringDeserializer` converts a buffer into a string using the `buffer.toString()` method. If the original data was converted into JSON strings by our `KafkaJSONSerializer` before being stored as buffers, the result of `buffer.toString()` will be the JSON string representation of these objects or arrays. However, `KafkaStringDeserializer` does not automatically convert these strings back into their original object or array forms.

While one option might be to manually parse these strings using `JSON.parse()` within a try-catch block to handle any non-JSON data, this approach is risky and can lead to exceptions if the string is not in valid JSON format. To reliably address this limitation, a more advanced deserializer, like our `KafkaAvroDeserializer`, can be used. It interprets and reconstructs data types accurately by using Avro schemas in conjunction with the Confluent Schema Registry, ensuring safer and more consistent deserialization.

Our `KafkaVoidDeserializer` is a specialized deserializer that discards any incoming data, always returning null upon deserialization.

## Compression and Decompression Codecs

### Compression Codecs

Compression codecs are used to reduce the size of data before storage or transmission. This process involves encoding the data in such a way that it takes up less space.

Our `KafkaModule` supports specifying a default compression algorithm in the client configuration. This setting applies to all messages emited. The library allows the use of the following compression algorithms:

- snappy
- zstd
- gzip
- lz4
- none (if no compression is provided)

For `LZ4` and `Zstd` we had to provide our own codec functions (encode and decode) because the existing `KafkaJS` implementation does not work well with Node.js 20.

### Decompression Codecs

Decompression codecs are used to revert the compressed data back to its original form. This process involves decoding the compressed data to reconstruct the original data structures.

Our librart through `KafkaJS` automatically detects and applies the appropriate decompression algorithm based on message metadata. No additional configuration is required.
