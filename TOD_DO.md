TODO

dire que c'est exclusivement un module esm
en version 1.0.0 seul un topic de consommation et d'ecriture -coverage sur tests dinteg et tests unitaire ?
utiliser 1 test helper avec kafkajs et 1 test helper avec confluent kafka
L'approche de NestJS pour Kafka est l'utilisation de connecter un microservice a son application pour pouvoir beneficier de kafka.

Lorsqu'on connecte un microservice avec le transport KAFKA dans nestjs, cela va automatiquement detecter les méthodes décorées pour la consommation et au lancement de l'application executer le handler correspondant au nom du topic.

Si l'utilisateur de souhaite consommer plusieurs topics avec les memes options (comme le deserializer par exemple) alors il peut simplement decorer plusieurs methdoes dans son controlleur.

Par contre, s'il souhaite consommer differents topics avec des options differentes, il va devoir connecter autant de microservices a son applciation qu'il a d'options.

// main.ts async function bootstrap() { const app = await NestFactory.create(AppModule); const configService = app.get(ConfigService); app.connectMicroservice(KAFKA_CONSUMER1_OPTION); app.connectMicroservice(KAFKA_CONSUMER2_OPTION);

setUpSwagger(app);

const port = configService.get('PORT') ?? 3000;

await app.startAllMicroservices();

await app.listen(port); } bootstrap();

// kafka.options.ts export const KAFKA_CONSUMER1_OPTION: KafkaOptions = { transport: Transport.KAFKA, options: { client: { ssl: true, sasl: { mechanism: 'scram-sha-512', username: process.env.KAFKA_SASL_USERNAME!, password: process.env.KAFKA_SASL_PASSWORD!, }, brokers: 'broker1-address', }, consumer: { groupId: 'consumer1', allowAutoTopicCreation: false, }, postfixId: '', }, };

export const KAFKA_CONSUMER2_OPTION: KafkaOptions = { transport: Transport.KAFKA, options: { client: { ssl: true, sasl: { mechanism: 'scram-sha-512', username: process.env.KAFKA_SASL_USERNAME!, password: process.env.KAFKA_SASL_PASSWORD!, }, brokers: 'broker1-address', }, consumer: { groupId: 'consumer2', allowAutoTopicCreation: false, }, postfixId: '', }, };

// kafka.controller.ts ... @MessagePattern('topic') async consume(@Payload() message: unknown) { console.log(message);

return 1; }

Le problème décrit concerne l'utilisation de deux clients Kafka au sein d'un même serveur NestJS pour consommer différents topics sur le même broker Kafka. L'auteur constate que, malgré l'utilisation de deux clients distincts avec des identifiants de groupe différents, les deux clients consomment les messages de tous les topics, entraînant une duplication des événements.

OPEN ISSUE: nestjs/nest#11298 LINKED ISSUE: nestjs/nest#13421

Meme nest ne propose pas encore de solution

Tout comme Nest, cette librairie actuellement ne propose la consommation de messages d'un seul topic.
