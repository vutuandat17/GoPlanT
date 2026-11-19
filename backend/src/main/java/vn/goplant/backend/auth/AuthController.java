package vn.goplant.backend.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    public AuthController(AuthService auth) { this.auth = auth; }
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
    @GetMapping(value = "/verify-email", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public String confirmVerification(@RequestParam String token) {
        if (!token.matches("^[A-Za-z0-9_-]{40,50}$")) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid verification token");
        return "<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Xác minh GoPlant</title>"
                + "<body style=\"font:16px system-ui;max-width:520px;margin:12vh auto;padding:24px;color:#173f30\"><h1>Xác minh email GoPlant</h1>"
                + "<p>Nhấn nút bên dưới để xác minh địa chỉ email và kích hoạt tài khoản.</p><form method=\"post\" action=\"/api/v1/auth/verify-email\">"
                + "<input type=\"hidden\" name=\"token\" value=\"" + token + "\"><button style=\"padding:12px 20px;background:#174f3b;color:white;border:0;border-radius:8px;font-size:16px\">Xác minh email</button></form></body></html>";
    }
    @PostMapping(value = "/verify-email", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE, produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public String verifyFromEmailLink(@RequestParam String token) {
        auth.verifyEmail(token);
        return "<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><title>Đã xác minh</title>"
                + "<body style=\"font:16px system-ui;max-width:520px;margin:12vh auto;padding:24px;color:#173f30\"><h1>Email đã xác minh</h1>"
                + "<p>Tài khoản GoPlant đã được kích hoạt. Bạn có thể quay lại ứng dụng và đăng nhập.</p></body></html>";
    }
    @PostMapping("/login")
    public AuthService.LoginResult login(@Valid @RequestBody LoginRequest request) { return auth.login(request.email(), request.password()); }
    @PostMapping("/refresh")
    public AuthService.LoginResult refresh(@Valid @RequestBody RefreshRequest request) { return auth.refresh(request.refreshToken()); }
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestBody(required = false) RefreshRequest request) {
        if (request != null) auth.logout(request.refreshToken());
    }
    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangePasswordRequest request) {
        auth.changePassword(java.util.UUID.fromString(jwt.getSubject()), request.currentPassword(), request.newPassword());
    }
    @PostMapping("/forgot-password")
    public AuthService.ForgotPasswordResult forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return auth.forgotPassword(request.email());
    }
    @GetMapping(value = "/reset-password", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public String resetPasswordForm(@RequestParam String token) {
        if (!token.matches("^[A-Za-z0-9_-]{40,50}$")) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Liên kết đặt lại mật khẩu không hợp lệ.");
        }
        return "<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Đặt lại mật khẩu GoPlant</title>"
                + "<body style=\"font:16px system-ui;max-width:460px;margin:10vh auto;padding:24px;color:#173f30\"><h1>Đặt lại mật khẩu GoPlant</h1>"
                + "<p>Nhập mật khẩu mới (tối thiểu 12 ký tự) cho tài khoản của bạn.</p>"
                + "<form method=\"post\" action=\"/api/v1/auth/reset-password\" style=\"display:flex;flex-direction:column;gap:12px\">"
                + "<input type=\"hidden\" name=\"token\" value=\"" + token + "\">"
                + "<input type=\"password\" name=\"newPassword\" minlength=\"12\" maxlength=\"72\" required placeholder=\"Mật khẩu mới (12-72 ký tự)\" style=\"padding:12px;border:1px solid #c9ddd0;border-radius:8px;font-size:15px\">"
                + "<button style=\"padding:12px 20px;background:#174f3b;color:white;border:0;border-radius:8px;font-size:16px\">Cập nhật mật khẩu</button></form></body></html>";
    }
    @PostMapping(value = "/reset-password", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPasswordJson(@Valid @RequestBody ResetPasswordRequest request) {
        auth.resetPassword(request.token(), request.newPassword());
    }
    @PostMapping(value = "/reset-password", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE, produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public String resetPasswordFormSubmit(@RequestParam String token, @RequestParam String newPassword) {
        if (newPassword == null || newPassword.length() < 12 || newPassword.length() > 72) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu mới cần có từ 12 đến 72 ký tự.");
        }
        auth.resetPassword(token, newPassword);
        return "<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><title>Đã đặt lại mật khẩu</title>"
                + "<body style=\"font:16px system-ui;max-width:460px;margin:10vh auto;padding:24px;color:#173f30\"><h1>Đã cập nhật mật khẩu</h1>"
                + "<p>Mật khẩu tài khoản GoPlant đã được đặt lại. Bạn có thể quay lại ứng dụng và đăng nhập bằng mật khẩu mới.</p></body></html>";
    }
    @GetMapping("/me")
    public AuthService.UserView me(@AuthenticationPrincipal Jwt jwt) {
        return auth.getUser(java.util.UUID.fromString(jwt.getSubject()));
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
