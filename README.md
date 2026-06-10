# document-template-engine

DOCX 템플릿에 JSON 응답의 값을 채워 넣어 완성된 DOCX 파일을 생성합니다.

## 동작 흐름

```
templates/<템플릿>.docx  +  mocks/response.json  ──▶  output/<템플릿>-rendered.docx
```

- `templates/` 안의 DOCX 파일을 읽음
- `mocks/response.json`의 `value` 객체를 추출하여 템플릿 필드에 치환
- 결과는 `output/` 폴더에 저장

## 폴더 구조

```
.
├── src/
│   ├── renderer.js     # DOCX 렌더링 로직 (docxtemplater)
│   └── generate.js     # CLI 엔트리
├── templates/          # 입력 DOCX 템플릿 보관
├── mocks/
│   └── response.json   # 더미 API 응답
└── output/             # 생성된 DOCX
```

## 설치

```bash
npm install
```

## 사용법

`templates/` 폴더에 DOCX 템플릿을 넣은 뒤 실행합니다.

```bash
# 예: templates/이력서.docx 를 렌더링
npm run generate -- 이력서.docx

# 확장자 생략 가능
npm run generate -- 이력서

# 직접 실행
node src/generate.js 이력서
```

결과는 `output/<템플릿이름>-rendered.docx` 로 저장됩니다.

## 템플릿 작성 규약

DOCX 본문에 아래 형식의 플레이스홀더를 넣으면 됩니다.

### 단일 값 — 점 표기

`mocks/response.json` 의 `value` 구조:

```json
{
  "value": {
    "인적사항": {
      "성명": "박지후",
      "주소": "서울·인천권"
    }
  }
}
```

템플릿 본문:

```
성명: {인적사항.성명}
주소: {인적사항.주소}
```

### 배열 — 반복 루프

```json
{
  "value": {
    "학력사항": [
      "재학기간: 2014-2018, 학교명 및 전공: 컴퓨터과학 (원격대학)"
    ]
  }
}
```

템플릿 본문:

```
[학력사항]
{#학력사항}
- {.}
{/학력사항}
```

> `{#배열명} ... {/배열명}` 사이의 내용이 원소마다 반복됩니다. 원소 자체를 출력할 때는 `{.}` 를 사용합니다.

## 예시 템플릿 (`templates/이력서.docx`)

빈 Word 문서에 아래 내용을 입력해 `templates/이력서.docx` 로 저장하세요.

```
이력서

[인적사항]
성명: {인적사항.성명}
주소: {인적사항.주소}
연락처: {인적사항.연락처}
이메일: {인적사항.이메일}
생년월일: {인적사항.생년월일}

[학력사항]
{#학력사항}
- {.}
{/학력사항}
```

## 에러 코드

| 코드 | 설명 |
|---|---|
| `INVALID_TEMPLATE_NAME` | 템플릿 이름이 잘못됨 (경로 조작 등) |
| `TEMPLATE_NOT_FOUND` | `templates/` 폴더에 해당 파일 없음 |
| `TEMPLATE_READ_FAILED` | 파일 읽기 실패 |
| `RENDER_FAILED` | 플레이스홀더 미정의/구문 오류 등 |
