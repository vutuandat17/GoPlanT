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
        String link = verificationBaseUrl + "/api/v1/auth/verify-email?token=" + token;
        send(recipient,
                "Xác minh email GoPlant",
                "Xin chào,\n\nVui lòng mở liên kết sau để xác minh địa chỉ email của bạn:\n"
                        + link + "\n\nLiên kết chỉ sử dụng được một lần và hết hạn sau 24 giờ.\n"
                        + "Nếu bạn không tạo tài khoản GoPlant, hãy bỏ qua email này.");
    }

    public void sendPasswordReset(String recipient, String token) {
        String link = verificationBaseUrl + "/api/v1/auth/reset-password?token=" + token;
        send(recipient,
                "Đặt lại mật khẩu GoPlant",
                "Xin chào,\n\nBạn đã yêu cầu đặt lại mật khẩu cho tài khoản GoPlant.\n"
                        + "Vui lòng mở liên kết sau để đặt mật khẩu mới:\n"
                        + link + "\n\nHoặc nhập mã đặt lại mật khẩu trong ứng dụng: " + token
                        + "\n\nLiên kết và mã này chỉ sử dụng được một lần và hết hạn sau 60 phút.\n"
                        + "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này.");
    }

    private void send(String recipient, String subject, String body) {
        JavaMailSender mailSender = mailSenders.getIfAvailable();
        if (mailSender == null || verificationBaseUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Dịch vụ email hiện chưa sẵn sàng. Cấu hình SMTP và GOPLANT_PUBLIC_API_URL.");
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(recipient);
        message.setSubject(subject);
        message.setText(body);
        try {
            mailSender.send(message);
        } catch (MailException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Không thể gửi email lúc này. Vui lòng thử lại sau.", exception);
        }
    }
}
