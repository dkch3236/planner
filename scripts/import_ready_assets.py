"""Import already prepared assets without cropping, resizing or alpha changes."""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image
from prepare_assets import ROOT, make_catalog

BATCH = 'ready_assets_20260928'
ICONS = ['alert', 'friends', 'pets', 'home', 'wallet', 'camera', 'board_games',
         'movies', 'calendar', 'gift', 'birthday', 'knitting', 'travel', 'yoga',
         'singing', 'train', 'guitar', 'picnic', 'coffee', 'running', 'meal',
         'cooking', 'folder', 'soccer', 'baseball', 'clipboard', 'office',
         'family', 'religion']


def destination(folder, index):
    if folder == 'icons':
        if index == 29:
            return 'borders/border_floral_landscape.webp'
        return f'icons/illustrated/icon_{ICONS[index]}.webp'
    folders = {
        '날씨overlay_가로': ('overlays/weather', 'weather_overlay_landscape'),
        '배경_가로': ('backgrounds/landscape', 'background_landscape'),
        '배경_세로': ('backgrounds/portrait', 'background_portrait'),
        '보더라인+코너': ('borders', 'border_floral'),
        '종이텍스처': ('textures/paper', 'texture_paper'),
    }
    target, prefix = folders[folder]
    return f'{target}/{prefix}_{index+1:02d}.webp'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path.home()/'Downloads/asset_처리전.zip')
    args = parser.parse_args()
    output = ROOT/'public/assets'
    report = ROOT/'reports/assets'
    manifest_path = output/'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    previous = {a['path']: a for a in manifest['assets'] if a.get('import_batch') == BATCH}
    previous_by_source = {a['source']: a['path'] for a in previous.values()}
    retained = [a for a in manifest['assets'] if a.get('import_batch') != BATCH]
    hashes = {a['path']: hashlib.sha256((output/a['path']).read_bytes()).hexdigest() for a in retained}
    records, source_records, planned = [], [], []
    counts = Counter()
    with ZipFile(args.input) as archive:
        for member in sorted(archive.infolist(), key=lambda entry: entry.filename):
            if member.is_dir():
                continue
            name = member.filename if member.flag_bits & 2048 else member.filename.encode('cp437').decode('cp949')
            if Path(name).suffix.lower() != '.png':
                raise ValueError(f'Unexpected non-image input: {name}')
            folder = name.split('/')[-2]
            index = counts[folder]
            counts[folder] += 1
            relative = previous_by_source.get(name) or destination(folder, index)
            target = output/relative
            if target.exists() and relative not in previous:
                raise FileExistsError(f'Refusing to overwrite existing asset: {relative}')
            raw = archive.read(member)
            image = Image.open(io.BytesIO(raw)).convert('RGBA')
            planned.append((name, raw, image, relative, folder, index))
    if len({p[3] for p in planned}) != len(planned):
        raise ValueError('Duplicate output paths')
    for name, raw, image, relative, folder, index in planned:
        target = output/relative
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, 'WEBP', lossless=True, exact=True, method=6)
        with Image.open(target) as decoded:
            assert decoded.size == image.size and decoded.convert('RGBA').tobytes() == image.tobytes(), relative
        w,h = image.size
        records.append({'path': relative, 'source': name, 'source_index': 1,
            'source_bbox': [0,0,w,h], 'original_crop_size': [w,h], 'canvas_size': [w,h],
            'content_size': [w,h], 'center_offset': [0,0], 'category': relative.split('/')[0],
            'bytes': target.stat().st_size, 'import_batch': BATCH, 'source_folder': folder,
            'processing': 'lossless_webp_only', 'source_sha256': hashlib.sha256(raw).hexdigest()})
        source_records.append({'source': name, 'sha256': hashlib.sha256(raw).hexdigest(),
            'original_size': [w,h], 'import_batch': BATCH, 'slice_count': 1})
        print(relative, flush=True)
    assert all(hashlib.sha256((output/p).read_bytes()).hexdigest() == digest for p,digest in hashes.items())
    current = {a['path'] for a in records}
    for stale in previous.keys()-current:
        target = (output/stale).resolve()
        if target.is_relative_to(output.resolve()) and target.suffix == '.webp':
            target.unlink(missing_ok=True)
    manifest['assets'] = retained + records
    manifest['sources'] = [s for s in manifest['sources'] if s.get('import_batch') != BATCH] + source_records
    manifest['asset_count'] = len(manifest['assets'])
    manifest['categories'] = dict(Counter(a['category'] for a in manifest['assets']))
    manifest.setdefault('imports', {})[BATCH] = {'input': str(args.input.resolve()),
        'sha256': hashlib.sha256(args.input.read_bytes()).hexdigest(), 'count': len(records)}
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    make_catalog(manifest['assets'],output,report,manifest['review'])
    addition_report = report/'additions'
    addition_report.mkdir(exist_ok=True)
    make_catalog(records,output,addition_report,[])
    summary = {'verified': True, 'added': len(records), 'total': len(manifest['assets']),
        'existing_unchanged': len(hashes), 'source_folders': dict(counts),
        'checks': ['all imported RGBA pixels match source', 'original dimensions preserved',
                   'existing file hashes unchanged'], 'categories': manifest['categories']}
    (addition_report/'verification.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    verification_path = report/'verification.json'
    verification = json.loads(verification_path.read_text(encoding='utf-8')) if verification_path.exists() else {}
    verification.update(source_images=len(manifest['sources']), webp_files=len(manifest['assets']),
        categories=manifest['categories'], total_bytes=sum(a['bytes'] for a in manifest['assets']),
        latest_import=summary)
    verification_path.write_text(json.dumps(verification,ensure_ascii=False,indent=2),encoding='utf-8')
    result_path = report/'RESULTS.md'
    previous_result = result_path.read_text(encoding='utf-8') if result_path.exists() else ''
    marker = '<!-- ready-assets-import -->'
    previous_result = previous_result.split(marker)[0].rstrip()
    result_path.write_text(previous_result + '\n\n' + marker + '\n## 2026-09-28 추가 반영\n\n'
        + f'준비된 이미지 {len(records)}개 추가. 현재 전체 {len(manifest["assets"])}개.\n\n'
        + '원본 크기·RGBA 픽셀 보존, 크롭·리사이즈·투명도 처리 없음. 기존 에셋 파일 내용 유지 확인.\n\n'
        + '[추가 에셋 목록](additions/catalog.html)\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False))


if __name__ == '__main__':
    main()
