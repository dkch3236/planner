import unittest
from PIL import Image, ImageDraw
from prepare_assets import connected_components, clean_support, group_components, normalize, split_boxes, category_for
from asset_review import reviewed_crop, load_review
import tempfile
import json
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
from prepare_assets import process


class AssetTests(unittest.TestCase):
    def test_semantic_names_preserve_bytes_and_survive_regeneration(self):
        from name_icons import apply_icon_names
        mapping = json.loads(Path(__file__).with_name('icon_names.json').read_text(encoding='utf-8'))
        old, new = next(iter(mapping.items()))
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root/old).parent.mkdir(parents=True)
            for owned in [set(), {new}]:
                (root/old).write_bytes(b'unchanged image bytes')
                asset = {'path': old}
                apply_icon_names([asset], root, owned)
                self.assertEqual(asset['path'], new)
                self.assertEqual((root/new).read_bytes(), b'unchanged image bytes')
                self.assertFalse((root/old).exists())

    def test_slicer_preserves_separately_imported_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            output = root/'assets'
            output.mkdir()
            image_path = output/'imported.webp'
            Image.new('RGBA', (4,4), 'red').save(image_path, 'WEBP', lossless=True)
            original_bytes = image_path.read_bytes()
            asset = {'path': 'imported.webp', 'category': 'icons', 'import_batch': 'ready'}
            source = {'source': 'ready.png', 'import_batch': 'ready'}
            manifest = {'assets': [asset], 'sources': [source], 'imports': {'ready': {'count': 1}}}
            (output/'manifest.json').write_text(json.dumps(manifest))
            config = root/'rules.json'
            config.write_text('{}')
            args = SimpleNamespace(config=config, output=output, report=root/'report',
                                   input=root/'unused.zip', strict_alpha=True)
            with patch('prepare_assets.read_sources', return_value=[]), patch('prepare_assets.make_catalog'):
                process(args)
            result = json.loads((output/'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(result['assets'], [asset])
            self.assertEqual(result['sources'], [source])
            self.assertEqual(result['imports'], manifest['imports'])
            self.assertEqual(image_path.read_bytes(), original_bytes)

    def test_review_restores_detached_dot_and_removes_neighbor(self):
        source = Image.new('RGBA', (40, 60))
        draw = ImageDraw.Draw(source)
        draw.rectangle((5, 4, 14, 35), fill='red')
        draw.rectangle((7, 43, 12, 48), fill='red')
        draw.rectangle((30, 2, 35, 8), fill='blue')
        crop = reviewed_crop(source, {'box': [0, 0, 20, 55]})
        self.assertEqual(crop.getpixel((9, 46))[3], 255)
        clean = reviewed_crop(source, {'box': [0, 0, 40, 60], 'largest': True})
        self.assertEqual(clean.getpixel((32, 5))[3], 0)
        self.assertEqual(clean.getpixel((9, 20))[3], 255)

    def test_review_rejects_changed_original(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'review.json'
            path.write_text(json.dumps({'sources': {'image.png': {'sha256': 'wrong'}}}))
            with self.assertRaisesRegex(ValueError, 'source changed'):
                load_review(path, {'image.png': b'changed'})

    def test_alpha_one_is_foreground_and_diagonals_connect(self):
        mask = Image.new('L', (8, 8))
        mask.putpixel((1, 1), 1)
        mask.putpixel((2, 2), 255)
        mask.putpixel((6, 6), 255)
        components = connected_components(mask)
        self.assertEqual(sorted(c['area'] for c in components), [1, 2])
        self.assertIn([1, 1, 3, 3], [c['bbox'] for c in components])

    def test_noise_cleanup_is_explicit_and_configurable(self):
        mask = Image.new('L', (16, 16), 2)
        ImageDraw.Draw(mask).rectangle((4, 4, 10, 10), fill=200)
        mask.putpixel((15, 15), 200)
        support, components, discarded = clean_support(mask, 8, 4)
        self.assertEqual(support.getbbox(), (4, 4, 11, 11))
        self.assertEqual(len(components), 1)
        self.assertEqual(discarded, 1)

    def test_overlapping_bounds_do_not_merge_large_objects(self):
        components = [{'bbox': [0, 0, 100, 100], 'area': 2000},
                      {'bbox': [90, 0, 180, 100], 'area': 1500}]
        self.assertEqual(len(group_components(components, 6)), 2)

    def test_small_satellite_attaches_to_nearby_object(self):
        components = [{'bbox': [0, 0, 100, 100], 'area': 2000},
                      {'bbox': [102, 10, 106, 14], 'area': 16}]
        self.assertEqual(group_components(components, 6), [[0, 0, 106, 100]])

    def test_whitespace_split(self):
        mask = Image.new('L', (100, 40))
        draw = ImageDraw.Draw(mask)
        draw.rectangle((2, 2, 30, 30), fill=255)
        draw.rectangle((60, 2, 90, 30), fill=255)
        self.assertEqual(split_boxes(mask, 6), [[2, 2, 31, 31], [60, 2, 91, 31]])

    def test_uniform_scaling_and_center_padding(self):
        source = Image.new('RGBA', (100, 50), (200, 100, 50, 128))
        result, content, offset = normalize(source, (64, 64))
        self.assertEqual(content, (64, 32))
        self.assertEqual(offset, (0, 16))
        self.assertEqual(result.getchannel('A').getbbox(), (0, 16, 64, 48))
        self.assertEqual(result.getpixel((32, 32))[3], 128)
        self.assertEqual(category_for('elements_1', 400, 30)[0], 'borders')


if __name__ == '__main__':
    unittest.main()
