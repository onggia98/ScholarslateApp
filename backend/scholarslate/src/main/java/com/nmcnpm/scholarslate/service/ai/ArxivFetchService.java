package com.nmcnpm.scholarslate.service.ai;

import com.nmcnpm.scholarslate.entity.Paper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Fetch paper từ arXiv Atom/XML API.
 * Rate limit: 3 req/s → delay 350ms giữa các request.
 * Timeout: 30 giây mỗi request.
 * Bắt buộc sortBy=submittedDate&sortOrder=descending để lấy paper mới nhất.
 */
@Slf4j
@Service
public class ArxivFetchService {

    private static final String ARXIV_API =
            "https://export.arxiv.org/api/query?search_query=all:{keyword}" +
            "&sortBy=submittedDate&sortOrder=descending&max_results={maxResults}";

    private final RestClient restClient;
    private final int maxResults;
    private final long requestDelayMs;

    public ArxivFetchService(
            @Value("${scheduler.arxiv.max-results-per-keyword:10}") int maxResults,
            @Value("${scheduler.arxiv.request-delay-ms:350}") long requestDelayMs) {
        this.restClient = RestClient.builder()
                .defaultHeader("User-Agent", "PaperTracker/1.0")
                .build();
        this.maxResults = maxResults;
        this.requestDelayMs = requestDelayMs;
    }

    /**
     * Fetch papers theo keyword. Trả về list Paper chưa có embedding/summary.
     * Lỗi 4xx (trừ 429): bỏ keyword, ghi log.
     * Lỗi tạm thời (timeout, 5xx, 429): retry với exponential backoff, tối đa 2 lần.
     */
    public List<Paper> fetchByKeyword(String keyword) {
        // URLEncoder.encode chuẩn RFC 3986 — xử lý cả space, dấu ngoặc, dấu hai chấm, v.v.
        String encoded = URLEncoder.encode(keyword, StandardCharsets.UTF_8);
        String url = ARXIV_API
                .replace("{keyword}", encoded)
                .replace("{maxResults}", String.valueOf(maxResults));

        String xml = null;
        // Exponential backoff: retry tối đa 2 lần cho lỗi tạm thời
        for (int attempt = 0; attempt <= 2; attempt++) {
            try {
                if (attempt > 0) {
                    long backoff = (long) Math.pow(2, attempt) * 1000L;
                    Thread.sleep(backoff);
                    log.warn("Retry {} for keyword: {}", attempt, keyword);
                }
                xml = restClient.get().uri(url)
                        .retrieve()
                        .body(String.class);
                break;
            } catch (Exception e) {
                if (attempt == 2) {
                    log.error("Failed to fetch arXiv for keyword '{}': {}", keyword, e.getMessage());
                    return List.of();
                }
            }
        }

        if (xml == null) return List.of();

        try {
            // Delay 350ms sau mỗi request để tuân thủ rate limit arXiv
            Thread.sleep(requestDelayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        return parseAtomXml(xml);
    }

    /**
     * Parse Atom XML response từ arXiv thành list Paper entity (trạng thái PENDING).
     */
    private List<Paper> parseAtomXml(String xml) {
        List<Paper> papers = new ArrayList<>();
        try {
            Document doc = DocumentBuilderFactory.newInstance()
                    .newDocumentBuilder()
                    .parse(new ByteArrayInputStream(xml.getBytes()));
            doc.getDocumentElement().normalize();

            NodeList entries = doc.getElementsByTagName("entry");
            for (int i = 0; i < entries.getLength(); i++) {
                var entry = entries.item(i);
                var children = entry.getChildNodes();

                String arxivId = null, title = null, abstractText = null,
                        authors = null, paperUrl = null, pdfUrl = null;
                OffsetDateTime publishedAt = null;

                for (int j = 0; j < children.getLength(); j++) {
                    var node = children.item(j);
                    switch (node.getNodeName()) {
                        case "id" -> {
                            // arXiv id format: http://arxiv.org/abs/2301.00001v1 → extract "2301.00001"
                            String raw = node.getTextContent().trim();
                            arxivId = raw.replaceAll(".*/abs/", "").replaceAll("v\\d+$", "");
                            paperUrl = raw;
                        }
                        case "title"     -> title = node.getTextContent().trim()
                                .replaceAll("\\s+", " ");
                        case "summary"   -> abstractText = node.getTextContent().trim()
                                .replaceAll("\\s+", " ");
                        case "published" -> publishedAt = OffsetDateTime.parse(
                                node.getTextContent().trim(),
                                DateTimeFormatter.ISO_OFFSET_DATE_TIME);
                        case "author" -> {
                            // Gom tên tác giả, phân cách bằng ", "
                            var nameNode = ((org.w3c.dom.Element) node)
                                    .getElementsByTagName("name").item(0);
                            if (nameNode != null) {
                                String name = nameNode.getTextContent().trim();
                                authors = (authors == null) ? name : authors + ", " + name;
                            }
                        }
                        case "link" -> {
                            // Link PDF có title="pdf"
                            var elem = (org.w3c.dom.Element) node;
                            if ("pdf".equals(elem.getAttribute("title"))) {
                                pdfUrl = elem.getAttribute("href");
                            }
                        }
                    }
                }

                if (arxivId != null && title != null) {
                    papers.add(Paper.builder()
                            .arxivId(arxivId)
                            .title(title)
                            .abstractText(abstractText)
                            .authors(authors)
                            .paperUrl(paperUrl)
                            .pdfUrl(pdfUrl)
                            .publishedAt(publishedAt)
                            .processingStatus("PENDING")
                            .retryCount(0)
                            .isDuplicate(false)
                            .build());
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse arXiv XML: {}", e.getMessage());
        }
        return papers;
    }
}
