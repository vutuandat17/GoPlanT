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
    @GetMapping("/me")
    public AuthService.UserView me(@AuthenticationPrincipal Jwt jwt) {
        return auth.getUser(java.util.UUID.fromString(jwt.getSubject()));
    }
    @PutMapping("/me")
    public AuthService.UserView updateMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileUpdateRequest request) {
        return auth.updateDisplayName(java.util.UUID.fromString(jwt.getSubject()), request.displayName());
    }
    public record RegisterRequest(@NotBlank @Size(max=120) String displayName, @NotBlank @Email @Size(max=320) String email, @NotBlank @Size(min=12, max=72) String password) {}
    public record VerifyRequest(@NotBlank String token) {}
    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
    public record ProfileUpdateRequest(@NotBlank @Size(max=120) String displayName) {}
}
