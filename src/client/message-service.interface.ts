import { type ProduceBatch } from './kafka-message.types';

export interface MessageService {
  emit<K, V>(data: ProduceBatch<K, V>): Promise<void>;
}
