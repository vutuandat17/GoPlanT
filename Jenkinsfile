pipeline {
    agent any

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    environment {
        APP_NAME              = 'GoPlant'
        BACKEND_DIR           = 'backend'
        FRONTEND_DIR          = 'GOPLANTT'
        SONAR_SERVER          = 'SonarQube-Server'
        SONAR_PROJECT         = 'goplant-backend'
        MAVEN_CLI_OPTS        = '-B -Dmaven.wagon.http.retryHandler.count=5'
        CI                    = 'true'
        COMPOSE_PROJECT_NAME  = 'goplant'
    }

    stages {
        stage('1. Checkout source') {
            steps {
                checkout scm
            }
        }

        stage('2. Verify Jenkins agent') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            java -version
                            mvn -version
                            node --version
                            npm --version
                            docker --version
                            docker compose version
                            docker info > /dev/null
                        '''
                    } else {
                        bat '''
                            java -version
                            mvn -version
                            node --version
                            call npm --version
                            docker --version
                            docker compose version
                            docker info
                        '''
                    }
                }
            }
        }

        stage('3. Test backend') {
            steps {
                dir("${env.BACKEND_DIR}") {
                    script {
                        if (isUnix()) {
                            sh "mvn ${env.MAVEN_CLI_OPTS} test"
                        } else {
                            bat "mvn ${env.MAVEN_CLI_OPTS} test"
                        }
                    }
                }
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: "${env.BACKEND_DIR}/target/surefire-reports/*.xml"
                }
            }
        }

        stage('4. Build backend JAR') {
            steps {
                dir("${env.BACKEND_DIR}") {
                    script {
                        if (isUnix()) {
                            sh "mvn ${env.MAVEN_CLI_OPTS} -DskipTests package"
                        } else {
                            bat "mvn ${env.MAVEN_CLI_OPTS} -DskipTests package"
                        }
                    }
                }
                archiveArtifacts artifacts: "${env.BACKEND_DIR}/target/*.jar", fingerprint: true
            }
        }

        stage('5. SonarQube analysis') {
            steps {
                dir("${env.BACKEND_DIR}") {
                    withSonarQubeEnv("${env.SONAR_SERVER}") {
                        script {
                            def sonarCommand = "mvn ${env.MAVEN_CLI_OPTS} org.sonarsource.scanner.maven:sonar-maven-plugin:4.0.0.4121:sonar -Dsonar.projectKey=${env.SONAR_PROJECT} -Dsonar.projectName=GoPlant-Backend"
                            if (isUnix()) {
                                sh sonarCommand
                            } else {
                                bat sonarCommand
                            }
                        }
                    }
                }
            }
        }

        stage('6. Test and export frontend web') {
            steps {
                dir("${env.FRONTEND_DIR}") {
                    script {
                        if (isUnix()) {
                            sh '''
                                npm ci
                                npm test
                                npx tsc --noEmit
                                npx expo export --platform web
                            '''
                        } else {
                            bat '''
                                call npm ci
                                call npm test
                                call npx tsc --noEmit
                                call npx expo export --platform web
                            '''
                        }
                    }
                }
            }
        }

        stage('7. Deploy local with Docker Compose') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            docker compose --project-name "$COMPOSE_PROJECT_NAME" up -d --build --wait --wait-timeout 180
                            curl --fail --silent --show-error http://localhost:8082/actuator/health
                        '''
                    } else {
                        bat '''
                            docker compose --project-name %COMPOSE_PROJECT_NAME% up -d --build --wait --wait-timeout 180
                            powershell -NoProfile -Command "(Invoke-WebRequest -UseBasicParsing -Uri http://localhost:8082/actuator/health -TimeoutSec 10).Content"
                        '''
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'GoPlant is running locally: frontend http://localhost:8081, API http://localhost:8082, Prometheus http://localhost:9090, Grafana http://localhost:3000.'
        }
        failure {
            script {
                if (isUnix()) {
                    sh 'docker compose --project-name "$COMPOSE_PROJECT_NAME" logs --no-color --tail=200 || true'
                } else {
                    bat 'docker compose --project-name %COMPOSE_PROJECT_NAME% logs --no-color --tail=200 || exit /b 0'
                }
            }
        }
        always {
            echo "Finished pipeline #${env.BUILD_NUMBER}."
        }
    }
}
