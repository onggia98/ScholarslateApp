package com.nmcnpm.scholarslate;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableCaching       // Recommendation cache (Caffeine, TTL 1h)
@EnableScheduling    // Scheduler cho AI pipeline (UC10) và Retry (UC17)
public class ScholarslateApplication {

	public static void main(String[] args) {
		SpringApplication.run(ScholarslateApplication.class, args);
	}

}
