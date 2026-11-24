FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
RUN mkdir -p /root/.m2 && printf '%s\n' \
  '<settings>' \
  '  <mirrors>' \
  '    <mirror>' \
  '      <id>google-maven-central</id>' \
  '      <name>GCS Maven Central mirror</name>' \
  '      <url>https://maven-central.storage-download.googleapis.com/maven2</url>' \
  '      <mirrorOf>central</mirrorOf>' \
  '    </mirror>' \
  '  </mirrors>' \
  '</settings>' > /root/.m2/settings.xml
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests -Dmaven.wagon.http.retryHandler.count=5 package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 spring
COPY --from=build /workspace/target/goplant-backend-0.1.0-SNAPSHOT.jar app.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
