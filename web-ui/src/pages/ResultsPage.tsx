import { useEffect, useState } from "react";
import { listItems } from "../api";
import { formatUtcPlus8Time } from "../time";

export function ResultsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [keyword, setKeyword] = useState("");

  async function load() {
    const data = await listItems({ page: 1, page_size: 100, keyword });
    setItems(data.items || []);
  }

  useEffect(() => {
    load().catch(() => setItems([]));
  }, []);

  return (
    <div className="card" data-testid="results-page">
      <h3>结果浏览</h3>
      <div className="row">
        <input
          placeholder="输入关键词筛选"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          aria-label="结果筛选"
        />
        <button type="button" onClick={() => load()}>
          刷新列表
        </button>
      </div>
      <table className="table" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>标题</th>
            <th>层级</th>
            <th>作者</th>
            <th>发布时间</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>
                <span className={`badge ${String(item.level || "").toLowerCase()}`}>{item.level}</span>
              </td>
              <td>{item.author}</td>
              <td>{formatUtcPlus8Time(item.created_at_x)}</td>
              <td>{item.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
