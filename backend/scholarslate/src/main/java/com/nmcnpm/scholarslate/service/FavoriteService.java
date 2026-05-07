package com.nmcnpm.scholarslate.service;

import com.nmcnpm.scholarslate.dto.common.PagedResponse;
import com.nmcnpm.scholarslate.dto.paper.PaperResponse;
import com.nmcnpm.scholarslate.exception.AppException;
import com.nmcnpm.scholarslate.mapper.PaperMapper;
import com.nmcnpm.scholarslate.repository.FavoriteRepository;
import com.nmcnpm.scholarslate.repository.PaperRepository;
import com.nmcnpm.scholarslate.entity.Favorite;
import com.nmcnpm.scholarslate.entity.User;
import com.nmcnpm.scholarslate.entity.Paper;
import com.nmcnpm.scholarslate.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FavoriteService {

    private final FavoriteRepository favoriteRepository;
    private final PaperRepository paperRepository;
    private final UserRepository userRepository;
    private final PaperMapper paperMapper;

    @Transactional(readOnly = true)
    public PagedResponse<PaperResponse> getFavorites(UUID userId, int page, int size) {
        var pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return PagedResponse.of(
                favoriteRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable)
                        .map(fav -> paperMapper.toResponse(fav.getPaper())));
    }

    @Transactional
    public void addFavorite(UUID paperId, UUID userId) {
        if (favoriteRepository.existsByUserIdAndPaperId(userId, paperId)) {
            throw AppException.conflict("Paper already in favorites");
        }

        Paper paper = paperRepository.findById(paperId)
                .orElseThrow(() -> AppException.notFound("Paper not found"));
        User user = userRepository.getReferenceById(userId);

        favoriteRepository.save(Favorite.builder()
                .user(user)
                .paper(paper)
                .build());
    }

    @Transactional
    public void removeFavorite(UUID paperId, UUID userId) {
        int deleted = favoriteRepository.deleteByUserIdAndPaperId(userId, paperId);
        if (deleted == 0) {
            throw AppException.notFound("Favorite not found");
        }
    }

    @Transactional(readOnly = true)
    public boolean isFavorite(UUID paperId, UUID userId) {
        return favoriteRepository.existsByUserIdAndPaperId(userId, paperId);
    }
}
