# CrystalTV
Node.js 기반 OTT 웹 앱입니다.
정적 페이지(`public/`)와 로컬 비디오/메타데이터(`videos/`)를 `src/server.js`에서 함께 서빙합니다.

## 📸 Preview
![CrystalTV Preview](github/preview.png)

## ✅ 요구사항
- Node.js 18 이상

## 🚀 실행
```bash
npm install
npm start
```

## 📂 데이터 구조
```text
.
├─ public/            # 프론트엔드 (HTML/CSS/JS)
│  ├─ index.html      # 홈
│  ├─ drama.html      # 드라마 탭
│  ├─ movie.html      # 영화 탭
│  ├─ latest.html     # 최신공개
│  ├─ category.html   # 카테고리
│  ├─ search.html     # 검색
│  ├─ history.html    # 시청 기록
│  ├─ watch.html      # 재생 페이지
│  ├─ information.html# 콘텐츠 정보
│  ├─ app.js
│  └─ styles.css
├─ src/
│  └─ server.js       # HTTP 서버 + /api/videos
└─ videos/            # 콘텐츠 폴더(영상/썸네일/메타데이터)
```

## 🎬 videos 폴더 규칙
각 콘텐츠는 `videos/<콘텐츠명>/` 폴더를 사용합니다.
권장 구조:
```text
videos/<콘텐츠명>/
├─ metadata.json
├─ img.png
└─ video/
   ├─ 1.mp4
   ├─ 2.mp4
   └─ ...
```

### metadata.json 주요 필드
아래 필드 중 일부만 있어도 동작합니다.
```json
{
  "title": "작품명",
  "category": "drama",
  "genre": "장르",
  "publicDate": "2026-03-14",
  "likes": 100000,
  "likesNumber": 100000,
  "isPopular": true,
  "totalEpisodes": 12,
  "episodes": [
    { "episode": 1, "title": "1화: 제목" },
    { "episode": 2, "title": "2화: 제목" }
  ]
}
```
참고:
- `category`가 `drama` 계열이면 드라마, `movie` 계열이면 영화로 분류됩니다.
- `publicDate`는 서버에서 `publishedAt`으로도 인식됩니다.
- `episodes`와 `totalEpisodes`는 정보 페이지/회차 표시에 사용됩니다.

### 사용 가능한 장르 목록
`인디`, `어린이 & 가족`, `애니메이션`, `액션`, `코미디`, `로맨스`, `스릴러`, `호러`, `SF`, `판타지`, `드라마 장르`, `범죄`, `스포츠 영화`, `다큐멘터리`, `음악 / 뮤지컬`, `고전`, `단편 영화`

## 🛠️ 개발 메모
- 서버는 별도 빌드 없이 바로 실행됩니다.
- 정적 파일 및 `/videos/*` 경로를 직접 서빙합니다.
- MP4는 Range 요청(부분 스트리밍)을 지원합니다.
