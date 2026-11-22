package vn.goplant.backend.auth;

import org.springframework.web.util.HtmlUtils;

final class AuthHtmlPages {
    private AuthHtmlPages() {}

    static String verifyConfirmPage(String token) {
        String escapedToken = escape(token);
        String body = """
                <div class="badge">GOPLANT ACCOUNT</div>
                <h1>Xác minh email GoPlant</h1>
                <p>Nhấn nút bên dưới để xác nhận địa chỉ email và kích hoạt tài khoản của bạn.</p>
                <form method="post" action="/api/v1/auth/verify-email">
                  <input type="hidden" name="token" value="%s">
                  <button type="submit" class="btn-primary">Xác minh email ngay</button>
                </form>
                <p class="hint">Liên kết xác minh chỉ có hiệu lực một lần trong vòng 24 giờ.</p>
                """.formatted(escapedToken);
        return layout("Xác minh email GoPlant", body);
    }

    static String verifySuccessPage(String appLoginUrl, String webLoginUrl) {
        String actions = buildAppLinks(appLoginUrl, webLoginUrl);
        String body = """
                <div class="badge badge-ok">ĐÃ KÍCH HOẠT</div>
                <h1>Email đã được xác minh!</h1>
                <p>Tài khoản GoPlant của bạn đã sẵn sàng. Bạn có thể mở lại ứng dụng và đăng nhập ngay bây giờ.</p>
                <div class="actions">%s</div>
                """.formatted(actions);
        return layout("Đã xác minh email - GoPlant", body);
    }

    static String verifyErrorPage(String title, String message, String appLoginUrl, String webLoginUrl) {
        String actions = buildAppLinks(appLoginUrl, webLoginUrl);
        String body = """
                <div class="badge badge-err">KHÔNG THỂ XÁC MINH</div>
                <h1>%s</h1>
                <p>%s</p>
                <p class="hint">Bạn có thể mở lại ứng dụng GoPlant và nhấn <strong>Gửi lại email xác minh</strong> tại màn hình Đăng nhập.</p>
                <div class="actions">%s</div>
                """.formatted(escape(title), escape(message), actions);
        return layout("Liên kết xác minh không hợp lệ - GoPlant", body);
    }

    static String resetPasswordFormPage(String token, String errorMessage) {
        String errorBanner = errorMessage == null || errorMessage.isBlank()
                ? ""
                : "<div class=\"alert-err\">" + escape(errorMessage) + "</div>";
        String body = """
                <div class="badge">BẢO MẬT GOPLANT</div>
                <h1>Đặt lại mật khẩu</h1>
                <p>Nhập mật khẩu mới (12–72 ký tự) cho tài khoản GoPlant của bạn.</p>
                %s
                <form method="post" action="/api/v1/auth/reset-password" class="form">
                  <input type="hidden" name="token" value="%s">
                  <input type="password" name="newPassword" minlength="12" maxlength="72" required placeholder="Mật khẩu mới (12–72 ký tự)" class="input">
                  <input type="password" name="confirmPassword" minlength="12" maxlength="72" required placeholder="Nhập lại mật khẩu mới" class="input">
                  <button type="submit" class="btn-primary">Cập nhật mật khẩu</button>
                </form>
                <p class="hint">Liên kết đặt lại mật khẩu chỉ sử dụng được một lần trong vòng 60 phút.</p>
                """.formatted(errorBanner, escape(token));
        return layout("Đặt lại mật khẩu - GoPlant", body);
    }

    static String resetPasswordSuccessPage(String appLoginUrl, String webLoginUrl) {
        String actions = buildAppLinks(appLoginUrl, webLoginUrl);
        String body = """
                <div class="badge badge-ok">ĐÃ CẬP NHẬT</div>
                <h1>Đã đặt lại mật khẩu!</h1>
                <p>Mật khẩu tài khoản GoPlant của bạn đã được cập nhật. Bạn có thể mở lại ứng dụng và đăng nhập bằng mật khẩu mới.</p>
                <div class="actions">%s</div>
                """.formatted(actions);
        return layout("Đã đặt lại mật khẩu - GoPlant", body);
    }

    static String resetPasswordErrorPage(String title, String message, String appLoginUrl, String webLoginUrl) {
        String actions = buildAppLinks(appLoginUrl, webLoginUrl);
        String body = """
                <div class="badge badge-err">KHÔNG THỂ ĐẶT LẠI MẬT KHẨU</div>
                <h1>%s</h1>
                <p>%s</p>
                <p class="hint">Bạn có thể mở lại ứng dụng GoPlant và chọn <strong>Quên mật khẩu?</strong> tại màn hình Đăng nhập để nhận liên kết mới.</p>
                <div class="actions">%s</div>
                """.formatted(escape(title), escape(message), actions);
        return layout("Liên kết đặt lại mật khẩu không hợp lệ - GoPlant", body);
    }

    private static String buildAppLinks(String appLoginUrl, String webLoginUrl) {
        StringBuilder sb = new StringBuilder();
        if (appLoginUrl != null && !appLoginUrl.isBlank()) {
            sb.append("<a class=\"btn-primary\" href=\"")
              .append(escape(appLoginUrl.trim()))
              .append("\">Mở ứng dụng GoPlant</a>");
        }
        if (webLoginUrl != null && !webLoginUrl.isBlank()) {
            sb.append("<a class=\"btn-secondary\" href=\"")
              .append(escape(webLoginUrl.trim()))
              .append("\">Đăng nhập trên trình duyệt</a>");
        }
        return sb.toString();
    }

    private static String layout(String title, String content) {
        return """
                <!doctype html>
                <html lang="vi">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <title>%s</title>
                  <style>
                    * { box-sizing: border-box; }
                    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #F4FBF5; color: #161D19; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
                    .card { width: 100%%; max-width: 460px; background: #FFFFFF; border: 1px solid #DCE8DF; border-radius: 18px; padding: 28px 24px; box-shadow: 0 10px 30px rgba(2, 52, 35, 0.08); }
                    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #E3F0E7; color: #023423; font-size: 11px; font-weight: 700; letter-spacing: 0.4px; margin-bottom: 12px; }
                    .badge-ok { background: #DDF2E4; color: #174F3B; }
                    .badge-err { background: #FEE2E2; color: #B42318; }
                    h1 { margin: 0 0 10px; font-size: 22px; line-height: 1.3; color: #023423; }
                    p { margin: 0 0 16px; font-size: 15px; line-height: 1.55; color: #414944; }
                    .hint { font-size: 13px; color: #717973; margin-top: 14px; margin-bottom: 0; }
                    .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
                    .form { display: flex; flex-direction: column; gap: 12px; }
                    .input { width: 100%%; padding: 12px 14px; border: 1px solid #CFE3D5; border-radius: 10px; font-size: 15px; color: #161D19; background: #F9FCFA; }
                    .alert-err { padding: 10px 12px; border-radius: 10px; background: #FEE2E2; color: #B42318; font-size: 13px; margin-bottom: 14px; }
                    .btn-primary { display: block; width: 100%%; text-align: center; text-decoration: none; padding: 13px 18px; background: #1E4B38; color: #FFFFFF; border: 0; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; }
                    .btn-secondary { display: block; width: 100%%; text-align: center; text-decoration: none; padding: 12px 18px; background: #EEF6F0; color: #023423; border: 1px solid #CFE3D5; border-radius: 12px; font-size: 14px; font-weight: 600; }
                  </style>
                </head>
                <body>
                  <main class="card">%s</main>
                </body>
                </html>
                """.formatted(escape(title), content);
    }

    private static String escape(String value) {
        return value == null ? "" : HtmlUtils.htmlEscape(value, "UTF-8");
    }
}
