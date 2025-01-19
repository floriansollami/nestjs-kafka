## Calculate the ideal `maxBytesPerPartition` and `maxBytes`

In Kafka, `maxBytesPerPartition` and `maxBytes` are configuration settings that manage how much data can be fetched per request, but each operates at a different level of granularity:

- `maxBytesPerPartition` controls the data fetched from an individual partition. It's useful for fine-tuning data flows, especially useful in environments where partitions have varying data loads.

- `maxBytes` sets the upper limit for the total amount of data fetched across all partitions per request. It ensures that a consumer doesn't overload by fetching too much data simultaneously.

To calculate the `maxBytesPerPartition` and `maxBytes` for handling a specific number of messages per KafkaJS batch efficiently, it's crucial to tailor each setting to the expected load and size of the messages. This approach ensures that your Kafka setup is optimized for the throughput demands and message characteristics of your application.

Here's how to approach it:

1. **Determine the Batch Size**: Decide on the number of messages you want to process in a single batch. This decision should be based on your processing capabilities and the desired throughput and latency. For example, if you choose a batch size of 1000 messages, proceed with the following steps to calculate the necessary settings.
2. **Estimate Average Message Size**: Obtain an average size of the messages expected to be processed, taking into account the impact of compression. The compression ratio will vary depending on the data type and the compression codec used (e.g., GZIP, Snappy, LZ4, ZSTD). If you haven't already calculated the average message size, you will need to estimate it, for example, by tracking the total bytes of all messages sent and dividing by the number of messages.
3. **Calculate Total Message Size for the Batch**: Multiply the average message size by your chosen batch size to get the total message size for the batch.
   ```plaintext
   Total Message Size = Average Message Size * Batch Size
                      = 315 bytes * 1000
                      = 315,000 bytes
   ```
4. **Add Overhead for Kafka Protocol and Message Metadata**: Kafka messages also carry additional metadata and are subject to protocol overhead. It's a good practice to allocate an extra buffer for this overhead. This can vary, but a common approach is to add about 10% to 20% on top of the calculated total message size.

   ```plaintext
   Overhead = Total Message Size * 20%
            = 315,000 bytes * 0.20
            = 63,000 bytes

   Adjusted Total Size = Total Message Size + Overhead
                       = 315,000 bytes + 63,000 bytes
                       = 378,000 bytes
   ```

5. **Configure maxBytesPerPartition and maxBytes**: Set maxBytesPerPartition to accommodate the adjusted compressed size, with some buffer:

   ```plaintext
   maxBytesPerPartition = 380,000 bytes (rounded up for safety)
   maxBytes = 380,000 bytes (or slightly more to allow for variations)
   ```

   In scenarios where there is one partition per pod, as in our infrastructure, both settings converge in functionality. This approach ensures that each pod can maximize its data fetch capacity per request without the risk of over-fetching, which could potentially lead to wasted resources or network congestion.

Considerations

- **Average Message Size**: If you have a well-calculated average message size (post-compression), this can suffice for most calculations. However, variability in compression effectiveness can lead to discrepancies, so monitoring and adjusting based on actual observed performance is crucial.
- **Monitoring and Adjustments**: Keep an eye on metrics like compression ratio, batch size, and throughput. Adjust maxBytesPerPartition and maxBytes as necessary based on these real-world observations.
