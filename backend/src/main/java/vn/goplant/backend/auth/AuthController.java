package vn.goplant.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.goplant.backend.config.PageResponse;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    private final AuthEventService authEvents;
    private final String appLoginUrl;
    private final String webLoginUrl;

    public AuthController(
            AuthService auth,
            AuthEventService authEvents,
            @Value("${goplant.email.app-login-url:goplantt://auth/login}") String appLoginUrl,
            @Value("${goplant.email.web-login-url:http://localhost:8081/auth/login}") String webLoginUrl) {
        this.auth = auth;
        this.authEvents = authEvents;
        this.appLoginUrl = appLoginUrl;
        this.webLoginUrl = webLoginUrl;
    }
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthService.Registration register(@Valid @RequestBody RegisterRequest request) { return auth.register(request.displayName(), request.email(), request.password()); }
    @PostMapping(value = "/verify-email", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void verify(@Valid @RequestBody VerifyRequest request) { auth.verifyEmail(request.token()); }
    @PostMapping("/resend-verification")
    public AuthService.ResendVerificationResult resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        return auth.resendVerification(request.email());
    }
    private static final MediaType TEXT_HTML_UTF8 = MediaType.parseMediaType("text/html;charset=UTF-8");

    @GetMapping(value = "/verify-email", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> confirmVerification(@RequestParam(required = false) String token) {
        if (token == null || !token.matches("^[A-Za-z0-9_-]{40,50}$")) {
            return ResponseEntity.badRequest()
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.verifyErrorPage(
                            "Liên kết xác minh không hợp lệ",
                            "Đường dẫn xác minh email bị thiếu hoặc không đúng định dạng.",
                            appLoginUrl,
                            webLoginUrl));
        }
        return ResponseEntity.ok()
                .contentType(TEXT_HTML_UTF8)
                .body(AuthHtmlPages.verifyConfirmPage(token));
    }

    @PostMapping(value = "/verify-email", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE, produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> verifyFromEmailLink(@RequestParam(required = false) String token) {
        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest()
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.verifyErrorPage(
                            "Liên kết xác minh không hợp lệ",
                            "Thiếu mã xác minh email.",
                            appLoginUrl,
                            webLoginUrl));
        }
        try {
            auth.verifyEmail(token);
            return ResponseEntity.ok()
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.verifySuccessPage(appLoginUrl, webLoginUrl));
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            return ResponseEntity.status(ex.getStatusCode())
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.verifyErrorPage(
                            "Liên kết đã hết hạn hoặc đã được sử dụng",
                            "Liên kết xác minh email chỉ có hiệu lực một lần trong 24 giờ hoặc tài khoản đã được kích hoạt trước đó.",
                            appLoginUrl,
                            webLoginUrl));
        }
    }
    @PostMapping("/login")
    public AuthService.LoginResult login(
            @Valid @RequestBody LoginRequest request,
            @RequestHeader(value = "X-Client-Platform", required = false) String clientPlatform,
            HttpServletRequest httpRequest) {
        return auth.login(request.email(), request.password(), AuthEventService.AuthClientInfo.from(httpRequest, clientPlatform));
    }
    @PostMapping("/refresh")
    public AuthService.LoginResult refresh(@Valid @RequestBody RefreshRequest request) { return auth.refresh(request.refreshToken()); }
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(
            @RequestBody(required = false) RefreshRequest request,
            @RequestHeader(value = "X-Client-Platform", required = false) String clientPlatform,
            HttpServletRequest httpRequest) {
        if (request != null) auth.logout(request.refreshToken(), AuthEventService.AuthClientInfo.from(httpRequest, clientPlatform));
    }
    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ChangePasswordRequest request,
            @RequestHeader(value = "X-Client-Platform", required = false) String clientPlatform,
            HttpServletRequest httpRequest) {
        auth.changePassword(java.util.UUID.fromString(jwt.getSubject()), request.currentPassword(), request.newPassword(),
                AuthEventService.AuthClientInfo.from(httpRequest, clientPlatform));
    }
    @PostMapping("/forgot-password")
    public AuthService.ForgotPasswordResult forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return auth.forgotPassword(request.email());
    }
    @GetMapping(value = "/reset-password", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> resetPasswordForm(@RequestParam(required = false) String token) {
        if (token == null || !token.matches("^[A-Za-z0-9_-]{40,50}$")) {
            return ResponseEntity.badRequest()
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.resetPasswordErrorPage(
                            "Liên kết đặt lại mật khẩu không hợp lệ",
                            "Đường dẫn đặt lại mật khẩu bị thiếu hoặc không đúng định dạng.",
                            appLoginUrl,
                            webLoginUrl));
        }
        return ResponseEntity.ok()
                .contentType(TEXT_HTML_UTF8)
                .body(AuthHtmlPages.resetPasswordFormPage(token, null));
    }
    @PostMapping(value = "/reset-password", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPasswordJson(
            @Valid @RequestBody ResetPasswordRequest request,
            @RequestHeader(value = "X-Client-Platform", required = false) String clientPlatform,
            HttpServletRequest httpRequest) {
        auth.resetPassword(request.token(), request.newPassword(), AuthEventService.AuthClientInfo.from(httpRequest, clientPlatform));
    }
    @PostMapping(value = "/reset-password", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE, produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> resetPasswordFormSubmit(
            @RequestParam(required = false) String token,
            @RequestParam(required = false) String newPassword,
            @RequestParam(required = false) String confirmPassword,
            HttpServletRequest httpRequest) {
        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest()
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.resetPasswordErrorPage(
                            "Liên kết đặt lại mật khẩu không hợp lệ",
                            "Thiếu mã đặt lại mật khẩu.",
                            appLoginUrl,
                            webLoginUrl));
        }
        if (newPassword == null || newPassword.length() < 12 || newPassword.length() > 72) {
            return ResponseEntity.badRequest()
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.resetPasswordFormPage(token, "Mật khẩu mới cần có từ 12 đến 72 ký tự."));
        }
        if (confirmPassword != null && !newPassword.equals(confirmPassword)) {
            return ResponseEntity.badRequest()
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.resetPasswordFormPage(token, "Mật khẩu mới và xác nhận mật khẩu chưa khớp."));
        }
        try {
            auth.resetPassword(token, newPassword, AuthEventService.AuthClientInfo.from(httpRequest, "web"));
            return ResponseEntity.ok()
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.resetPasswordSuccessPage(appLoginUrl, webLoginUrl));
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            String reason = ex.getReason();
            if (reason != null && reason.contains("khác mật khẩu hiện tại")) {
                return ResponseEntity.badRequest()
                        .contentType(TEXT_HTML_UTF8)
                        .body(AuthHtmlPages.resetPasswordFormPage(token, reason));
            }
            return ResponseEntity.status(ex.getStatusCode())
                    .contentType(TEXT_HTML_UTF8)
                    .body(AuthHtmlPages.resetPasswordErrorPage(
                            "Liên kết đã hết hạn hoặc đã được sử dụng",
                            "Liên kết đặt lại mật khẩu chỉ có hiệu lực một lần trong 60 phút hoặc đã được sử dụng trước đó.",
                            appLoginUrl,
                            webLoginUrl));
        }
    }
    @GetMapping("/me")
    public AuthService.UserView me(@AuthenticationPrincipal Jwt jwt) {
        return auth.getUser(java.util.UUID.fromString(jwt.getSubject()));
    }
    @GetMapping("/me/auth-events")
    public PageResponse<AuthEventService.AuthEventView> myAuthEvents(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return authEvents.listForUser(java.util.UUID.fromString(jwt.getSubject()), page, size);
    }
    @PutMapping("/me")
    public AuthService.UserView updateMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileUpdateRequest request) {
        return auth.updateDisplayName(java.util.UUID.fromString(jwt.getSubject()), request.displayName());
    }
    @PutMapping("/me/timezone")
    public AuthService.UserView updateTimezone(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TimezoneUpdateRequest request) {
        return auth.updateTimezone(java.util.UUID.fromString(jwt.getSubject()), request.timezone());
    }
    public record RegisterRequest(@NotBlank @Size(max=120) String displayName, @NotBlank @Email @Size(max=320) String email, @NotBlank @Size(min=12, max=72) String password) {}
    public record VerifyRequest(@NotBlank String token) {}
    public record ResendVerificationRequest(@NotBlank @Email String email) {}
    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
    public record RefreshRequest(@NotBlank String refreshToken) {}
    public record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank @Size(min=12, max=72) String newPassword) {}
    public record ForgotPasswordRequest(@NotBlank @Email String email) {}
    public record ResetPasswordRequest(@NotBlank String token, @NotBlank @Size(min=12, max=72) String newPassword) {}
    public record ProfileUpdateRequest(@NotBlank @Size(max=120) String displayName) {}
    public record TimezoneUpdateRequest(@NotBlank @Size(max=64) String timezone) {}
}
