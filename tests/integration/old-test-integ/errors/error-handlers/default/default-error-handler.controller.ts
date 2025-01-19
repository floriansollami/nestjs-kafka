import { Controller, UseFilters } from '@nestjs/common';
import { TestAllExceptionsFilter } from '@libs/testing';
import { ConsumeTopic } from '../../../../src';
import { inputTopic } from './default-error-handler.fixtures';

export class SimulateApplicationError extends Error {
  constructor() {
    super('an external error');
  }
}

@Controller()
@UseFilters(new TestAllExceptionsFilter()) // avoid default NestJS ExceptionsHandler to re-map the thrown error.
export class DefaultErrorHandlerController {
  @ConsumeTopic(inputTopic)
  async test3(): Promise<void> {
    throw new SimulateApplicationError();
  }
}
