# LOCALIZATION, RTL/LTR, CURRENCY & TIMEZONE — RAVAN

## 1. Supported Languages

| Code | Language | Direction (`dir`) | Primary Font |
| :--- | :--- | :---: | :--- |
| `ku` | Kurdish (Sorani — کوردیی ناوەندی) | `rtl` | `Vazirmatn` |
| `ar` | Arabic (العربية) | `rtl` | `Vazirmatn` |
| `en` | English | `ltr` | `Plus Jakarta Sans` |

### Localization Architecture
- All UI labels, navigation items, status labels, validation messages, and empty states reside in centralized localization dictionaries (`src/lib/i18n.ts`).
- Switching the UI language dynamically updates `<html lang="..." dir="rtl|ltr">` without mutating or corrupting stored database records.
- Trips support trilingual content fields (`titleKu`, `titleAr`, `titleEn`, `descriptionKu`, `descriptionAr`, `descriptionEn`) with automatic fallback if a secondary translation is blank.

---

## 2. Currency Policy (`IQD` & `USD`)

1. **Supported Currencies in MVP:**
   - `IQD` — Iraqi Dinar (دیناری عێراقی), formatted with zero decimal places (e.g., `250,000 IQD`).
   - `USD` — United States Dollar (دۆلاری ئەمریکی), formatted as integer or minor units (`$150 USD`).
2. **No Automatic Cross-Currency Mixing:**
   - `IQD` and `USD` totals are **never** added together into a single combined number.
   - All financial cards, booking ledgers, customer balances, and trip profitability reports display `IQD` and `USD` side-by-side in separate columns.
   - No hardcoded or speculative exchange rate is applied in MVP.

---

## 3. Timezone & Date Formatting

- **Database Storage:** All timestamps (`departure_at`, `return_at`, `created_at`, `received_at`) are stored in UTC.
- **Organization Timezone:** Defaults to `Asia/Baghdad` (`UTC+03:00`) and is configurable per organization in `organizations.timezone`.
- **UI Formatting:** Displayed using `Intl.DateTimeFormat` bound to the active organization's timezone (`Asia/Baghdad`).

---

## 4. Phone Number Normalization

- Phone numbers are normalized to international E.164-compatible format (`+964750XXXXXXX`) via `normalizePhoneNumber()` in `src/lib/validation.ts`.
- Local Iraqi/Kurdistan prefixes (`0750...`, `0770...`, `0780...`) are automatically normalized to `+9647...`.
