import { EventPattern } from '@nestjs/microservices';
import { ConsumeTopic } from './kafka.decorator';

jest.mock('@nestjs/microservices', () => ({
  EventPattern: jest.fn(),
}));

describe('ConsumeTopic', () => {
  it('should call EventPattern with the correct topic', () => {
    const mockTopic = 'test-topic';

    ConsumeTopic(mockTopic);

    expect(EventPattern).toHaveBeenCalledWith(mockTopic, {});
  });
});
