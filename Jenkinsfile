pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
    }

    environment {
        // Test-only key required while Spring creates its JWT components.
        GOPLANT_JWT_SECRET = 'ci-only-secret-key-at-least-32-bytes-long'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Frontend: install, test and lint') {
            steps {
                dir('GOPLANTT') {
                    script {
                        if (isUnix()) {
                            sh 'npm ci'
                            sh 'npm test'
                            sh 'npm run lint'
                        } else {
                            bat 'npm ci'
                            bat 'npm test'
                            bat 'npm run lint'
                        }
                    }
                }
            }
        }

        stage('Backend: test and package') {
            steps {
                dir('backend') {
                    script {
                        if (isUnix()) {
                            sh 'mvn -B -ntp verify'
                        } else {
                            bat 'mvn -B -ntp verify'
                        }
                    }
                }
            }
            post {
                always {
                    junit testResults: 'backend/target/surefire-reports/*.xml', allowEmptyResults: true
                }
            }
        }
    }

    post {
        success {
            archiveArtifacts artifacts: 'backend/target/*.jar', fingerprint: true
            echo 'GoPlanT CI passed; backend JAR archived.'
        }
        failure {
            echo 'GoPlanT CI failed. Review the failed stage and test reports in this build.'
        }
    }
}
