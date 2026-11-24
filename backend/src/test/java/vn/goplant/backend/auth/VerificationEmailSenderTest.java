package vn.goplant.backend.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.web.server.ResponseStatusException;

class VerificationEmailSenderTest {

    @SuppressWarnings("unchecked")
    @Test
    void throwsServiceUnavailableWhenSmtpHostIsBlank() {
        JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
        mailSender.setHost("");
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(mailSender);

        VerificationEmailSender sender = new VerificationEmailSender(provider, "no-reply@goplant.local", "http://localhost:8082");
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> sender.sendVerification("an@goplant.vn", "sample-token-123"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }

    @SuppressWarnings("unchecked")
    @Test
    void sendsMultipartHtmlVerificationEmailWhenConfigured() throws Exception {
        JavaMailSenderImpl mailSender = mock(JavaMailSenderImpl.class);
        when(mailSender.getHost()).thenReturn("smtp.gmail.com");
        MimeMessage mimeMessage = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(mailSender);

        VerificationEmailSender sender = new VerificationEmailSender(provider, "no-reply@goplant.local", "https://api.goplant.vn/");
        sender.sendVerification("an@goplant.vn", "abc-token-xyz");

        verify(mailSender).send(mimeMessage);
        mimeMessage.saveChanges();
        assertEquals("Xác minh email GoPlant", mimeMessage.getSubject());
        assertTrue(mimeMessage.getContentType().startsWith("multipart/"));
        assertTrue(mimeMessage.getContent() instanceof jakarta.mail.Multipart);
    }
}
