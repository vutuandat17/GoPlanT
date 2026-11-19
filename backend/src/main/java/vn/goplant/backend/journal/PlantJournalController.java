package vn.goplant.backend.journal;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.goplant.backend.config.PageResponse;
import vn.goplant.backend.journal.PlantJournalService.JournalEntry;
import vn.goplant.backend.journal.PlantJournalService.JournalRequest;
import vn.goplant.backend.journal.PlantJournalService.JournalUpdateRequest;
import vn.goplant.backend.journal.PlantJournalService.PhotoMeta;

/** Plant growth & care journals and attached photos. Scoped to the authenticated JWT subject. */
@RestController
@RequestMapping("/api/v1")
public class PlantJournalController {
    private final PlantJournalService journals;

    public PlantJournalController(PlantJournalService journals) { this.journals = journals; }

    @GetMapping("/journals")
    public PageResponse<JournalEntry> listAll(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID plantId,
            @RequestParam(required = false) String logType,
            @RequestParam(required = false) String healthStatus,
            @RequestParam(required = false) String q) {
        return journals.listAll(owner(jwt), page, size, plantId, logType, healthStatus, q);
    }

    @GetMapping("/plants/{plantId}/journals")
    public List<JournalEntry> listByPlant(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID plantId) {
        return journals.listByPlant(owner(jwt), plantId);
    }

    @PostMapping("/plants/{plantId}/journals")
    @ResponseStatus(HttpStatus.CREATED)
    public JournalEntry create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID plantId,
                               @Valid @RequestBody JournalRequest request) {
        return journals.create(owner(jwt), plantId, request);
    }

    @GetMapping("/journals/{journalId}")
    public JournalEntry get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID journalId) {
        return journals.get(owner(jwt), journalId);
    }

    @PutMapping("/journals/{journalId}")
    public JournalEntry update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID journalId,
                               @Valid @RequestBody JournalUpdateRequest request) {
        return journals.update(owner(jwt), journalId, request);
    }

    @DeleteMapping("/journals/{journalId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID journalId) {
        journals.delete(owner(jwt), journalId);
    }

    @PostMapping(value = "/journals/{journalId}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public PhotoMeta uploadPhoto(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID journalId,
                                 @RequestPart("file") MultipartFile file) {
        return journals.addPhoto(owner(jwt), journalId, file);
    }

    @GetMapping("/journals/{journalId}/photos/{photoId}")
    public ResponseEntity<byte[]> getPhoto(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID journalId,
                                           @PathVariable UUID photoId) {
        var photo = journals.getPhoto(owner(jwt), journalId, photoId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(CacheControl.noCache())
                .body(photo.bytes());
    }

    @DeleteMapping("/journals/{journalId}/photos/{photoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePhoto(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID journalId,
                            @PathVariable UUID photoId) {
        journals.deletePhoto(owner(jwt), journalId, photoId);
    }

    private static UUID owner(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
