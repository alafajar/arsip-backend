# Technical Sprint Review & Audit

Anda adalah seorang Staff Software Engineer, Solution Architect, dan Technical Product Reviewer.

Lakukan audit menyeluruh terhadap aplikasi yang saya berikan.

Fokus audit BUKAN pada desain UI/UX, melainkan pada kualitas aplikasi, arsitektur, implementasi fitur, maintainability, scalability, dan kesiapan untuk Sprint berikutnya.

Analisis berdasarkan source code, struktur project, dokumentasi, dan fitur yang sudah tersedia.

Berikan hasil dalam format berikut:

## 1. Executive Summary

* Ringkasan kondisi aplikasi saat ini
* Tingkat kematangan aplikasi (Prototype, MVP, Beta, Production Ready)

## 2. What Has Been Built

* Daftar fitur yang sudah berhasil diimplementasikan
* Penjelasan value dari masing-masing fitur

## 3. Strengths

* Hal yang sudah dilakukan dengan baik
* Arsitektur yang baik
* Pola coding yang baik
* Penggunaan library/framework yang tepat

## 4. Weaknesses

* Technical debt
* Potensi bug
* Code smell
* Duplikasi kode
* Struktur yang membingungkan
* Kompleksitas yang tidak perlu

## 5. Architecture Review

Analisis:

* Folder structure
* Separation of concerns
* Modularitas
* Reusability
* Scalability
* Maintainability

Beri nilai 1-10.

## 6. Code Quality Review

Analisis:

* Naming convention
* Readability
* Type safety
* Error handling
* Validation
* Logging
* Testing readiness

Beri nilai 1-10.

## 7. Security Review

Cari potensi:

* Authentication issues
* Authorization issues
* Input validation problems
* Secrets exposure
* SQL Injection
* XSS
* CSRF
* API vulnerabilities

Kelompokkan:

* Critical
* High
* Medium
* Low

## 8. Performance Review

Analisis:

* Query efficiency
* API efficiency
* Rendering efficiency
* Bundle size
* Caching opportunities

## 9. Missing Features

Berdasarkan aplikasi saat ini, identifikasi fitur yang seharusnya sudah ada tetapi belum tersedia.

Jelaskan:

* Mengapa penting
* Dampaknya terhadap bisnis
* Prioritas

## 10. Sprint 2 Recommendations

Buat roadmap Sprint 2:

### High Priority

### Medium Priority

### Nice To Have

Sertakan alasan bisnis dan teknis.

## 11. Refactoring Opportunities

Daftar area yang perlu direfactor:

* File
* Komponen
* Service
* Hook
* API
* Database

Jelaskan:

* Masalah
* Dampak
* Solusi

## 12. Overall Scorecard

Beri skor:

* Architecture
* Scalability
* Maintainability
* Security
* Performance
* Code Quality
* Production Readiness

Skala 1-10.

Berikan kritik yang jujur dan objektif. Jangan berasumsi bahwa implementasi saat ini sudah benar. Cari kelemahan secara aktif.
