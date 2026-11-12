package vn.goplant.backend.auth;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class VerificationEmailSender {
    private final ObjectProvider<JavaMailSender> mailSenders;
    private final String from;
    private final String verificationBaseUrl;

    public VerificationEmailSender(ObjectProvider<JavaMailSender> mailSenders,
                                   @Value("${goplant.email.from:no-reply@goplant.local}") String from,
                                   @Value("${goplant.email.verification-base-url:}") String verificationBaseUrl) {
        this.mailSenders = mailSenders;
        this.from = from;
        this.verificationBaseUrl = verificationBaseUrl.trim().replaceAll("/+$", "");
    }

    public void sendVerification(String recipient, String token) {
        JavaMailSender mailSender = mailSenders.getIfAvailable();
        if (mailSender == null || verificationBaseUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email verification is unavailable. Configure SMTP and GOPLANT_PUBLIC_API_URL.");
        }

        String link = verificationBaseUrl + "/api/v1/auth/verify-email?token=" + token;
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(recipient);
        message.setSubject("Xác minh email GoPlant");
        message.setText("Xin chào,\n\nVui lòng mở liên kết sau để xác minh địa chỉ email của bạn:\n"
                + link + "\n\nLiên kết chỉ sử dụng được một lần và hết hạn sau 24 giờ.\n"
                + "Nếu bạn không tạo tài khoản GoPlant, hãy bỏ qua email này.");
        try {
            mailSender.send(message);
        } catch (MailException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Không thể gửi email xác minh lúc này. Vui lòng thử lại sau.", exception);
        }
    }
}
