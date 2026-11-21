package vn.goplant.backend.auth;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;

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
        String textBody = "Xin chào,\n\nVui lòng mở liên kết sau để xác minh địa chỉ email của bạn:\n"
                + link + "\n\nLiên kết chỉ sử dụng được một lần và hết hạn sau 24 giờ.\n"
                + "Nếu bạn không tạo tài khoản GoPlant, hãy bỏ qua email này.";
        String htmlBody = buildHtmlEmail(
                "Xác minh địa chỉ email",
                "Cảm ơn bạn đã đăng ký tài khoản GoPlant. Nhấn nút bên dưới để xác minh email và kích hoạt tài khoản của bạn.",
                "Xác minh tài khoản GoPlant",
                link,
                null,
                "Liên kết chỉ sử dụng được một lần và hết hạn sau 24 giờ. Nếu bạn không tạo tài khoản GoPlant, hãy bỏ qua email này.");
        send(recipient, "Xác minh email GoPlant", textBody, htmlBody);
    }

    public void sendPasswordReset(String recipient, String token) {
        String link = verificationBaseUrl + "/api/v1/auth/reset-password?token=" + token;
        String textBody = "Xin chào,\n\nBạn đã yêu cầu đặt lại mật khẩu cho tài khoản GoPlant.\n"
                + "Vui lòng mở liên kết sau để đặt mật khẩu mới:\n"
                + link + "\n\nHoặc nhập mã đặt lại mật khẩu trong ứng dụng: " + token
                + "\n\nLiên kết và mã này chỉ sử dụng được một lần và hết hạn sau 60 phút.\n"
                + "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này.";
        String htmlBody = buildHtmlEmail(
                "Đặt lại mật khẩu GoPlant",
                "Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản GoPlant. Nhấn nút bên dưới hoặc nhập mã xác nhận trong ứng dụng.",
                "Đặt lại mật khẩu",
                link,
                token,
                "Liên kết và mã này chỉ sử dụng được một lần và hết hạn sau 60 phút. Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này.");
        send(recipient, "Đặt lại mật khẩu GoPlant", textBody, htmlBody);
    }

    private void send(String recipient, String subject, String textBody, String htmlBody) {
        JavaMailSender mailSender = mailSenders.getIfAvailable();
        boolean missingHost = mailSender instanceof JavaMailSenderImpl impl
                && (impl.getHost() == null || impl.getHost().isBlank());
        if (mailSender == null || missingHost || verificationBaseUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Dịch vụ email hiện chưa sẵn sàng. Cấu hình SMTP (MAIL_HOST) và GOPLANT_PUBLIC_API_URL.");
        }
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");
            helper.setFrom(from);
            helper.setTo(recipient);
            helper.setSubject(subject);
            helper.setText(textBody, htmlBody);
            mailSender.send(mimeMessage);
        } catch (MailException | MessagingException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Không thể gửi email lúc này. Vui lòng thử lại sau.", exception);
        }
    }

    private static String buildHtmlEmail(
            String heading,
            String intro,
            String ctaLabel,
            String ctaUrl,
            String codeBox,
            String footerNote) {
        String safeUrl = HtmlUtils.htmlEscape(ctaUrl, "UTF-8");
        String codeSection = codeBox == null || codeBox.isBlank()
                ? ""
                : "<div style=\"margin:16px 0;padding:12px 14px;background:#F4FBF5;border:1px dashed #9AC4AA;border-radius:10px;font-family:monospace;font-size:14px;color:#023423;word-break:break-all\">"
                + HtmlUtils.htmlEscape(codeBox, "UTF-8") + "</div>";
        return """
                <!doctype html>
                <html lang="vi">
                <body style="margin:0;padding:24px;background:#F4FBF5;font-family:system-ui,-apple-system,sans-serif;color:#161D19;">
                  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE8DF;border-radius:16px;padding:28px 24px;">
                    <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#E3F0E7;color:#023423;font-size:11px;font-weight:700;letter-spacing:0.4px;margin-bottom:12px;">GOPLANT</div>
                    <h1 style="margin:0 0 10px;font-size:21px;line-height:1.3;color:#023423;">%s</h1>
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#414944;">%s</p>
                    <a href="%s" style="display:inline-block;padding:13px 22px;background:#1E4B38;color:#FFFFFF;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">%s</a>
                    %s
                    <p style="margin:18px 0 6px;font-size:12px;line-height:1.5;color:#717973;">Nếu nút không hoạt động, hãy sao chép liên kết sau vào trình duyệt:</p>
                    <p style="margin:0 0 16px;font-size:12px;line-height:1.4;color:#1E4B38;word-break:break-all;">%s</p>
                    <hr style="border:0;border-top:1px solid #E7EFE9;margin:16px 0;">
                    <p style="margin:0;font-size:12px;line-height:1.5;color:#717973;">%s</p>
                  </div>
                </body>
                </html>
                """.formatted(
                HtmlUtils.htmlEscape(heading, "UTF-8"),
                HtmlUtils.htmlEscape(intro, "UTF-8"),
                safeUrl,
                HtmlUtils.htmlEscape(ctaLabel, "UTF-8"),
                codeSection,
                safeUrl,
                HtmlUtils.htmlEscape(footerNote, "UTF-8"));
    }
}
