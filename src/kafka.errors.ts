interface KafkaLibErrorOptions {
  cause?: unknown;
  metadata?: Record<string, unknown>;
}

export type KafkaLibErrorJSON = {
  message: string;
  stack?: string;
  cause?: unknown;
  metadata?: Record<string, unknown>;
};

export abstract class KafkaLibError extends Error {
  override readonly cause?: unknown;
  readonly metadata?: Record<string, unknown>;

  constructor(message: string, { cause, metadata }: KafkaLibErrorOptions = {}) {
    super(message);

    Error.captureStackTrace(this, this.constructor);

    this.cause = cause;
    this.metadata = metadata;
  }

  /**
   * Provides a custom JSON representation when this error is stringified.
   *
   * NOTE: In JavaScript, the `message` and `stack` properties are non-enumerable,
   * meaning they won't appear in the default serialization unless explicitly included,
   * as done here.
   */
  toJSON(): KafkaLibErrorJSON {
    return {
      message: this.message,
      stack: this.stack,
      cause: this.cause instanceof KafkaLibError ? this.cause.toJSON() : this.cause,
      metadata: this.metadata,
    };
  }
}

export class KafkaLibProducerNotSetError extends KafkaLibError {
  constructor() {
    super('Kafka producer is not set');
  }
}

export class KafkaLibMessageUnsetKeyError extends KafkaLibError {
  constructor() {
    super('Cannot set deserialized key on an unset Kafka message');
  }
}

export class KafkaLibMessageUnsetValueError extends KafkaLibError {
  constructor() {
    super('Cannot set deserialized value on an unset Kafka message');
  }
}

export class KafkaLibProducerSendError extends KafkaLibError {
  constructor(cause?: unknown) {
    super('Failed to send message', { cause });
  }
}

export class KafkaLibDeserializerNotSetError extends KafkaLibError {
  constructor() {
    super('Kafka deserializer is not set');
  }
}

export class KafkaLibSerializerNotSetError extends KafkaLibError {
  constructor() {
    super('Kafka serializer is not set');
  }
}

export class KafkaLibDeserializationError extends KafkaLibError {
  constructor(cause?: unknown) {
    super('Failed to deserialize', { cause });
  }
}

export class KafkaLibSerializationError extends KafkaLibError {
  constructor(cause?: unknown) {
    super('Failed to serialize', { cause });
  }
}

export class KafkaLibAvroSchemaIdNotFoundInMemoryError extends KafkaLibError {
  constructor() {
    super('Kafka avro schema id not found in memory');
  }
}

export class KafkaLibHeaderFilterError extends KafkaLibError {
  constructor() {
    super('Header filter provided but no header (or empty header)');
  }
}

export class KafkaLibKeyFilterError extends KafkaLibError {
  constructor() {
    super('Key filter provided but no key');
  }
}
