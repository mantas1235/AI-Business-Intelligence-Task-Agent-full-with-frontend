import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../api/client';
import { sendChat, listFiles, uploadCsv } from '../api/endpoints';
import { resolveChartUrl, isAllowedChartUrl } from '../utils/url';

describe('api endpoints', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sendChat POSTs { file_id, question } to /chat', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { ai_answer: 'ok' } } as never);
    await sendChat('file-123', 'what is the avg?');
    expect(post).toHaveBeenCalledWith(
      '/chat',
      { file_id: 'file-123', question: 'what is the avg?' },
      expect.any(Object),
    );
  });

  it('listFiles GETs /files', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: [] } as never);
    await listFiles();
    expect(get).toHaveBeenCalledWith('/files', expect.any(Object));
  });

  it('uploadCsv posts multipart form data with field "file"', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { status: 'Success', file_id: 'f1', info: { name: 'x.csv', total_rows: 1 } },
    } as never);
    const file = new File(['a,b\n1,2'], 'x.csv', { type: 'text/csv' });
    await uploadCsv(file);
    const [path, form] = post.mock.calls[0];
    expect(path).toBe('/upload-csv');
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('file')).toBeInstanceOf(File);
  });
});

describe('chart url resolution', () => {
  it('accepts /static/ paths and absolutizes them', () => {
    expect(resolveChartUrl('/static/x.png')).toMatch(/\/static\/x\.png$/);
    expect(isAllowedChartUrl('/static/x.png')).toBe(true);
  });

  it('rejects non-static or foreign origins', () => {
    expect(isAllowedChartUrl('https://evil.example.com/static/x.png')).toBe(false);
    expect(isAllowedChartUrl('/etc/passwd')).toBe(false);
  });
});
