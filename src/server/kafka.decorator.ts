import { Inject } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { KAFKA_SERVICE } from './kafka.constants';

export function ConsumeTopic(topic: string): MethodDecorator {
  return EventPattern(topic, {});
}

type InjectResult = PropertyDecorator & ParameterDecorator;

export const InjectMessageService = (): InjectResult => Inject(KAFKA_SERVICE);
