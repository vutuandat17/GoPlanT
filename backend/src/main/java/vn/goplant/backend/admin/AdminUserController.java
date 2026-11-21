package vn.goplant.backend.admin;

import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.goplant.backend.admin.AdminUserService.AdminUserDetail;
import vn.goplant.backend.admin.AdminUserService.AdminUserStats;
import vn.goplant.backend.admin.AdminUserService.AdminUserSummary;
import vn.goplant.backend.admin.AdminUserService.AuditLogEntry;
import vn.goplant.backend.admin.AdminUserService.RevokeSessionsRequest;
import vn.goplant.backend.admin.AdminUserService.UpdateAdminRoleRequest;
import vn.goplant.backend.admin.AdminUserService.UpdateStatusRequest;
import vn.goplant.backend.auth.AuthEventService;
import vn.goplant.backend.config.PageResponse;

/** Administrative user management, role assignment, session revocation, and audit log endpoints. */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminUserController {
    private final AdminUserService adminUsers;
    private final AuthEventService authEvents;

    public AdminUserController(AdminUserService adminUsers, AuthEventService authEvents) {
        this.adminUsers = adminUsers;
        this.authEvents = authEvents;
    }

    @GetMapping("/users/stats")
    public AdminUserStats getStats() {
        return adminUsers.getStats();
    }

    @GetMapping("/users")
    public PageResponse<AdminUserSummary> listUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String activity) {
        return adminUsers.listUsers(page, size, q, status, role, activity);
    }

    @GetMapping("/users/{id}")
    public AdminUserDetail getUser(@PathVariable UUID id) {
        return adminUsers.getUser(id);
    }

    @PatchMapping("/users/{id}/status")
    public AdminUserDetail updateStatus(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateStatusRequest request) {
        return adminUsers.updateStatus(actor(jwt), id, request);
    }

    @PutMapping("/users/{id}/roles")
    public AdminUserDetail updateAdminRole(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateAdminRoleRequest request) {
        return adminUsers.updateAdminRole(actor(jwt), id, request);
    }

    @PostMapping("/users/{id}/revoke-sessions")
    public AdminUserDetail revokeSessions(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) RevokeSessionsRequest request) {
        return adminUsers.revokeSessions(actor(jwt), id, request == null ? null : request.reason());
    }

    @PostMapping("/users/{id}/resend-verification")
    public AdminUserService.AdminResendVerificationResponse resendVerification(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) RevokeSessionsRequest request) {
        return adminUsers.resendVerification(actor(jwt), id, request == null ? null : request.reason());
    }

    @GetMapping("/audit-logs")
    public PageResponse<AuditLogEntry> listAuditLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID targetUserId,
            @RequestParam(required = false) String action) {
        return adminUsers.listAuditLogs(page, size, targetUserId, action);
    }

    @GetMapping("/auth-events")
    public PageResponse<AuthEventService.AuthEventView> listAuthEvents(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String q) {
        return authEvents.listForAdmin(page, size, userId, eventType, q);
    }

    @GetMapping("/users/{id}/auth-events")
    public PageResponse<AuthEventService.AuthEventView> listUserAuthEvents(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return authEvents.listForAdmin(page, size, id, null, null);
    }

    private static UUID actor(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
