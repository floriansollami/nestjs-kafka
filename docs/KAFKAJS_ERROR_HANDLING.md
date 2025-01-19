# KafkaJS Error Handling

## Overview

`KafkaJS` is a client library for Apache Kafka that provides a framework for producing and consuming messages. Despite its reliability, errors can occur when working with KafkaJS. Understanding and handling these errors is crucial for maintaining the stability of your application. This document outlines how KafkaJS handles errors, categorizes them, and suggests strategies to address potential dangers such as silent errors and indefinite loops.

## How does KafkaJS handle errors?

When working with `KafkaJS` to fetch or produce messages, errors can occur. These errors are categorized into two types: retriable and non-retriable. The retriability of most errors is defined by the Kafka protocol itself, as detailed in the [Kafka Protocol Error Codes](https://kafka.apache.org/protocol#protocol_error_codes).

### Internal Errors (thrown by kafkajs)

**Non-Retriable Errors:**
![kafkajs internal non-retriable error](./kafkajs-internal-non-retriable-error.png 'kafkajs internal non-retriable error')

- For internal errors flagged as non-retriable, `KafkaJS` will not execute the retry backoff strategy. Instead, it will directly invoke its crash hook.
- This crash hook emits a `CRASH` event <u>but does not restart the consumer</u> (`restartOnFailure` post hook is NOT called).
- **Attention:** This does not stop your application; your Node process will continue to execute, but your application will never consume Kafka messages. This can result in a silent, indefinite halt in message consumption.

**Retriable Errors:**
![kafkajs internal retriable error](./kafkajs-internal-retriable-error.png 'kafkajs internal retriable error')

- For internal errors flagged as retriable, `KafkaJS` executes its exponential backoff retry logic based on your configuration settings.
- By default, `KafkaJS` will retry 5 times exponentially. If the retries are exhausted, a `KafkaJSNumberOfRetriesExceeded` error is thrown, and the `restartOnFailure` post hook is called.
- Subsequently, a `CRASH` event is emitted, <u>restarting the consumer</u>.
- **Attention:** Restarting the consumer does not mean restarting the entire application. It involves refetching batches and retrying from the last offset. This could lead to an infinite loop of consumer restarts if the retriable error is never resolved.

### External Errors (thrown by your application logic)

![kafkajs external error](./kafkajs-external-error.png 'kafkajs external error')

- External errors, such as those thrown by your application logic while iterating over batch messages, trigger the same exponential backoff retry logic based on your configuration settings.
- By default, `KafkaJS` will retry 5 times exponentially. If the retries are exhausted, a `KafkaJSNumberOfRetriesExceeded` error is thrown, and the `restartOnFailure` post hook is called.
- Subsequently, a `CRASH` event is emitted, <u>restarting the consumer</u>.
- **Attention:** Similar to internal errors, restarting the consumer does not mean restarting the application. It means refetching batches and retrying from the last offset. You could enter an infinite loop of consumer restarts if the external error is never resolved.

## How to address the potential dangers of silent errors and indefinite loops?

To mitigate the risks associated with silent errors and indefinite loops, we have implemented a strategy to gracefully shut down the NestJS application in specific scenarios:

### Internal Errors (thrown by kafkajs)

**Non-Retriable Errors:**
![kafkajs internal non-retriable error solution](./kafkajs-internal-non-retriable-error-solution.png 'kafkajs internal non-retriable error solution')
We decided to listen to the `KafkaJS` `CRASH` event and gracefully shut down the NestJS app issuing a process kill with `SIGTERM` to trigger the NestJS `onApplicationShutdown` method. This approach allows for a graceful disconnection of all app connections, such as database connections, `KafkaJS` producers and consumers to avoid delays in Kafka rebalancing or MongoDB replica set elections.

**Retriable Errors:**
![kafkajs internal retriable error solution](./kafkajs-internal-retriable-error-solution.png 'kafkajs internal retriable error solution')

We chose to react to the `restartOnFailure` hook of `KafkaJS` (which is called during retriable errors) by gracefully shut down the NestJS app issuing a process kill with `SIGTERM` to trigger the NestJS `onApplicationShutdown` method. This approach allows for a graceful disconnection of all app connections, such as database connections, `KafkaJS` producers and consumers to avoid delays in Kafka rebalancing or MongoDB replica set elections..

We ignore the `CRASH` event in this case. Since `KafkaJS` allows us to decide the course of action through the `restartOnFailure` hook for retriable errors.

### External Errors (thrown by your application logic)

![kafkajs external error solution](./kafkajs-external-error.png 'kafkajs external error solution')

We applied the same approach as for retriable internal errors.
