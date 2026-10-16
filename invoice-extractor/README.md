# Invoice Extractor

Gemini API ile isleyen qebz ve faktura melumat cixaricisi.

## Qurasdirma

1. Layihe qovluguna girin:
```bash
cd invoice-extractor
```

2. Asililiqlari qurasdirin:
```bash
npm install
```

3. `.env` faylini hazirlayin:
```bash
cp .env.example .env
```

4. `.env` daxilinde API acari yazin:
```env
REACT_APP_GEMINI_API_KEY=AIzaSy-buraya-senin-acarin
```

API acari almaq ucun:
[Google AI Studio API keys](https://aistudio.google.com/app/apikey)

5. Tetbiqi basladin:
```bash
npm start
```

Sonra brauzerde bu unvana baxin:
[http://localhost:3000](http://localhost:3000)

## Xususiyyetler

- Sekilden invoice ve receipt JSON cixarma
- Cedvel gorunusu
- JSON ve CSV export
- AI chat ile neticeni redakte etmek
- Light mode ve night mode

## Texnologiyalar

- React 18
- Gemini 2.5 Flash
- Browser-side REST API integration

## Qeyd

Bu demo API acari brauzerde istifade edir. Production ucun API cagrilarini backend uzerinden etmek daha duzgundur.
