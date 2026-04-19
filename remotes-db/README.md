# IR Remotes Database

## Structure

```
remotes/
  {make}/
    {model-slug}.json     ← verified remotes
pending/
  submissions/            ← user-submitted new remotes (review before approving)
  reports/                ← "this remote is wrong" reports
index.json                ← searchable index of all verified remotes
images/                   ← remote images (PNG, transparent background preferred)
```

## Approving a submission

1. Review the JSON in `pending/submissions/`
2. Check the IR codes are correct
3. Move the file to `remotes/{make}/`
4. Add an entry to `index.json`
5. Delete the submission file

## Remote JSON format

```json
{
  "id": "unique-slug",
  "make": "Brand Name",
  "model": "Model Name",
  "model_aliases": ["alternative", "model", "names"],
  "image": "URL to remote image",
  "verified": true,
  "buttons": [
    {
      "id": "power",
      "label": "Power",
      "x": 50,
      "y": 5,
      "code": "base64_ir_code_here"
    }
  ]
}
```

Button `x` and `y` are percentages (0-100) of the image dimensions.
