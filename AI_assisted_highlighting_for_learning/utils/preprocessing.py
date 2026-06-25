import re


NOISE_PATTERNS = [
    r"^\s*part of a series on\s*$",
    r"^\s*category\s*$",
    r"^\s*portal\s*$",
    r"^\s*vte\s*$",
    r"^\s*definition\s*$",
    r"^\s*etymology\s*$",
    r"^\s*synonyms\s*$",
    r"^\s*main articles:.*$",
    r"^\s*this box:.*$",
    r"^\s*duration:.*$",
    r"^\s*\(video.*$",
]


def normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def remove_inline_citations(text: str) -> str:
    text = re.sub(r"\[[^\]]*\]", "", text)
    text = re.sub(r":\s*\d+(?:[--]\d+)?", "", text)
    return text


def is_noise_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if len(stripped) < 3:
        return True
    if re.fullmatch(r"[-−–—←→·•\s\d.]+", stripped):
        return True
    alpha_count = sum(1 for ch in stripped if ch.isalpha())
    if alpha_count < 2:
        return True
    for pattern in NOISE_PATTERNS:
        if re.match(pattern, stripped, flags=re.IGNORECASE):
            return True
    return False


def clean_text(text: str) -> str:
    text = remove_inline_citations(text)
    text = normalize_whitespace(text)
    return text


def split_into_paragraphs(text: str) -> list[str]:
    """
    Împarte textul în paragrafe curate.
    Praguri PERMISIVE intenționat — mai bine să includă un paragraf scurt
    decât să rateze idei importante.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    
    blocks = [block.strip() for block in text.split("\n\n") if block.strip()]

   
    if len(blocks) <= 2:
        blocks = [block.strip() for block in text.split("\n") if block.strip()]

    paragraphs = []
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        cleaned_lines = [
            remove_inline_citations(line).strip()
            for line in lines
            if not is_noise_line(line)
        ]
        if not cleaned_lines:
            continue

        paragraph = clean_text(" ".join(cleaned_lines))

       
        if len(paragraph) < 40:
            continue
        if len(paragraph.split()) < 6:
            continue

        paragraphs.append(paragraph)

    print(f"[DEBUG preprocessing] Paragrafe găsite după filtrare: {len(paragraphs)}")
    return paragraphs


def split_into_sentences(text: str) -> list[str]:
    text = clean_text(text)
    if not text:
        return []

    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]

    filtered = []
    for sentence in sentences:
       
        if len(sentence.split()) >= 4:
            filtered.append(sentence)

    return filtered