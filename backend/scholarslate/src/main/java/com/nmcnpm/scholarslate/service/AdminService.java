package com.nmcnpm.scholarslate.service;

import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.exception.AppException;
import com.nmcnpm.scholarslate.mapper.PaperMapper;
import com.nmcnpm.scholarslate.repository.PaperRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * UC17 — Nghiệp vụ admin: xem và reset paper FAILED.
 * Tách khỏi AdminController để đảm bảo @Transactional nằm ở service layer.
 */
@Service
@RequiredArgsConstructor
public class AdminService {

    private final PaperRepository paperRepository;
    private final PaperMapper paperMapper;

    /**
     * Lấy danh sách paper FAILED (phân trang).
     * Admin xem để quyết định có cần reset hay không (UC17).
     * is_favorite = false — admin không cần thông tin này.
     */
    @Transactional(readOnly = true)
    public PagedResponse<PaperResponse> getFailedPapers(int page, int size) {
        var pageable = PageRequest.of(page, size, Sort.by("updatedAt").descending());
        return PagedResponse.of(
                paperRepository.findByProcessingStatus("FAILED", pageable)
                        .map(paperMapper::toResponse));
    }

    /**
     * Reset 1 paper FAILED — reset retryCount = 0 để RetryScheduler pick up lại (UC17).
     * Status giữ nguyên là FAILED — RetryScheduler tìm theo FAILED AND retryCount < MAX.
     */
    @Transactional
    public void resetFailedPaper(UUID paperId) {
        int updated = paperRepository.resetFailedPaper(paperId);
        if (updated == 0) {
            throw AppException.notFound("Paper not found or not in FAILED status");
        }
    }

    /**
     * Reset toàn bộ paper FAILED — giúp phục hồi sau sự cố hệ thống (UC17).
     * Trả về số paper đã reset.
     */
    @Transactional
    public int resetAllFailedPapers() {
        return paperRepository.resetAllFailedPapers();
    }
}
