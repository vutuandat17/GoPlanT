pipeline {
    agent any

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    environment {
        APP_NAME        = 'GoPlant'
        BACKEND_DIR     = 'backend'
        FRONTEND_DIR    = 'GOPLANTT'
        SONAR_SERVER    = 'SonarQube-Server'
        SONAR_PROJECT   = 'goplant-backend'
        MAVEN_CLI_OPTS  = '-B -Dmaven.wagon.http.retryHandler.count=5'
        CI              = 'true'
    }

    stages {
        stage('1. Checkout Source Code') {
            steps {
                echo "=== [1/6] Checkout mã nguồn dự án ${env.APP_NAME} ==="
                checkout scm
            }
        }

        stage('2. Verify Build Environment') {
            steps {
                echo "=== [2/6] Kiểm tra công cụ build (Java 21, Maven, Node.js, npm) ==="
                script {
                    if (isUnix()) {
                        sh '''
                            java -version
                            mvn -version
                            node -v
                            npm -v
                        '''
                    } else {
                        bat '''
                            java -version
                            mvn -version
                            node -v
                            call npm -v
                        '''
                    }
                }
            }
        }

        stage('3. Backend - Unit Test (Spring Boot)') {
            steps {
                echo "=== [3/6] Chạy kiểm thử tự động Backend (Java 21 + Maven) ==="
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

        stage('4. SonarQube - Code Quality Analysis') {
            steps {
                echo "=== [4/6] Phân tích chất lượng mã nguồn và bảo mật với SonarQube ==="
                dir("${env.BACKEND_DIR}") {
                    withSonarQubeEnv("${env.SONAR_SERVER}") {
                        script {
                            def sonarCmd = "mvn ${env.MAVEN_CLI_OPTS} org.sonarsource.scanner.maven:sonar-maven-plugin:4.0.0.4121:sonar -Dsonar.projectKey=${env.SONAR_PROJECT} -Dsonar.projectName=\"GoPlant Backend\""
                            if (isUnix()) {
                                sh sonarCmd
                            } else {
                                bat sonarCmd
                            }
                        }
                    }
                }
            }
        }

        stage('5. Backend - Package JAR Artifact') {
            steps {
                echo "=== [5/6] Đóng gói Backend Spring Boot thành file JAR ==="
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

        stage('6. Frontend - Test & Typecheck (Expo / React Native)') {
            steps {
                echo "=== [6/6] Cài đặt dependencies, chạy Unit Test & TypeScript Typecheck cho Frontend ==="
                dir("${env.FRONTEND_DIR}") {
                    script {
                        if (isUnix()) {
                            sh '''
                                npm ci
                                npm test
                                npx tsc --noEmit
                            '''
                        } else {
                            bat '''
                                call npm ci
                                call npm test
                                call npx tsc --noEmit
                            '''
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            echo "CI/CD Pipeline (kèm SonarQube Analysis) cho dự án ${env.APP_NAME} đã hoàn tất THÀNH CÔNG!"
        }
        failure {
            echo "CI/CD Pipeline cho dự án ${env.APP_NAME} bị lỗi. Vui lòng kiểm tra Console Output."
        }
        always {
            echo "Kết thúc lượt chạy Pipeline #${env.BUILD_NUMBER}."
        }
    }
}
