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
        MAVEN_CLI_OPTS  = '-B -Dmaven.wagon.http.retryHandler.count=5'
        CI              = 'true'
    }

    stages {
        stage('1. Checkout Source Code') {
            steps {
                echo "=== [1/5] Checkout mã nguồn dự án ${env.APP_NAME} ==="
                checkout scm
            }
        }

        stage('2. Verify Build Environment') {
            steps {
                echo "=== [2/5] Kiểm tra công cụ build (Java 21, Maven, Node.js, npm) ==="
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
                echo "=== [3/5] Chạy kiểm thử tự động Backend (Java 21 + Maven) ==="
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

        stage('4. Backend - Package JAR Artifact') {
            steps {
                echo "=== [4/5] Đóng gói Backend Spring Boot thành file JAR ==="
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

        stage('5. Frontend - Test & Typecheck (Expo / React Native)') {
            steps {
                echo "=== [5/5] Cài đặt dependencies, chạy Unit Test & TypeScript Typecheck cho Frontend ==="
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
            echo "CI/CD Pipeline cho dự án ${env.APP_NAME} đã hoàn tất THÀNH CÔNG!"
        }
        failure {
            echo "CI/CD Pipeline cho dự án ${env.APP_NAME} bị lỗi. Vui lòng kiểm tra Console Output."
        }
        always {
            echo "Kết thúc lượt chạy Pipeline #${env.BUILD_NUMBER}."
        }
    }
}
