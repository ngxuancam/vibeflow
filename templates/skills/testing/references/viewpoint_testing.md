# Common Test Viewpoint Base Knowledge

> Dùng làm bộ kiến thức nền để generate test case cho các dự án web quản lý truyền thống, đặc biệt phù hợp với mô hình Java Spring Boot MVC + Thymeleaf, hệ thống CRUD, search/list/detail/create/edit/delete, khách hàng Nhật.

---

## 1. Mục đích tài liệu

Tài liệu này định nghĩa bộ **Common Test Viewpoint / テスト観点共通マスタ** có thể tái sử dụng cho nhiều loại màn hình trong web quản lý.

Bộ viewpoint này dùng để:

- Làm base knowledge cho AI hoặc tester khi generate test case.
- Chuẩn hóa quan điểm test giữa các màn hình.
- Tránh thiếu sót khi tạo test case cho các màn hình CRUD.
- Dễ mapping với từng màn hình cụ thể theo dạng áp dụng / không áp dụng.
- Phù hợp với dự án khách hàng Nhật cần test kỹ UI, validation, quyền, dữ liệu, thao tác bất thường.

---

## 2. Phạm vi áp dụng

Áp dụng cho các loại màn hình sau:

| Loại màn hình | Ví dụ |
|---|---|
| Login / Logout | Đăng nhập, đăng xuất, quên mật khẩu |
| Search / List | Danh sách user, danh sách đơn hàng, danh sách khách hàng |
| Detail | Chi tiết record, chi tiết đơn hàng |
| Create | Đăng ký mới dữ liệu |
| Edit | Cập nhật dữ liệu |
| Delete | Xóa logic, xóa vật lý |
| Confirm / Complete | Xác nhận trước khi lưu, màn hình hoàn tất |
| Master Maintenance | Quản lý master code, category, role |
| File Upload / Download | Import CSV, export CSV, upload attachment |
| Approval / Workflow | Duyệt đơn, chuyển trạng thái |
| Dashboard / Report | Thống kê, báo cáo, biểu đồ đơn giản |

---

## 3. Quy ước mức độ ưu tiên

| Priority | Ý nghĩa |
|---|---|
| High | Bắt buộc test. Lỗi ảnh hưởng trực tiếp đến nghiệp vụ, bảo mật, dữ liệu hoặc quyền. |
| Medium | Nên test. Lỗi ảnh hưởng đến trải nghiệm, thao tác phụ, hoặc một số trường hợp biên. |
| Low | Test khi có thời gian. Chủ yếu là cosmetic, edge case ít xảy ra. |

---

## 4. Quy ước loại test

| Test Type | Ý nghĩa |
|---|---|
| Normal | Trường hợp thao tác bình thường, dữ liệu hợp lệ. |
| Abnormal | Trường hợp lỗi, dữ liệu không hợp lệ, thao tác sai. |
| Boundary | Giá trị biên, min/max, length boundary. |
| Security | Bảo mật, quyền, injection, CSRF, XSS. |
| Usability | Dễ sử dụng, message, điều hướng, hiển thị. |
| Data | Kiểm tra dữ liệu DB, transaction, consistency. |
| Regression | Kiểm tra ảnh hưởng sau sửa đổi. |

---

## 5. Common Test Viewpoint Master

## VP-01. Screen Display / 画面表示

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-01 |
| Viewpoint Name | Screen Display / 画面表示 |
| Applicable Screen | Tất cả màn hình, popup, modal, dialog, confirm popup |
| Priority | High |
| Test Type | Normal, Usability |

### Checkpoints

- Màn hình hiển thị đúng theo thiết kế / wireframe / specification.
- Popup/modal/dialog hiển thị đúng title, message, input, default/focus state, button chính/phụ và trạng thái lỗi ban đầu.
- Title màn hình đúng.
- Header, footer, menu, breadcrumb hiển thị đúng.
- Label, item name, button name đúng ngôn ngữ yêu cầu.
- Không bị vỡ layout.
- Không hiển thị text debug, stacktrace, key message chưa convert.
- Dữ liệu null / blank không làm lỗi màn hình.
- Các item không áp dụng cho role hiện tại không được hiển thị.

### Common Expected Result

- Màn hình hiển thị đúng layout, đúng nội dung, không phát sinh lỗi UI.

---

## VP-02. Initial Display / 初期表示

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-02 |
| Viewpoint Name | Initial Display / 初期表示 |
| Applicable Screen | Search, List, Detail, Create, Edit |
| Priority | High |
| Test Type | Normal |

### Checkpoints

- Giá trị default được set đúng.
- Dropdown / radio / checkbox có trạng thái mặc định đúng.
- Search condition mặc định đúng.
- List ban đầu hiển thị đúng theo specification.
- Màn create không hiển thị dữ liệu cũ.
- Màn edit load đúng dữ liệu hiện tại từ DB.
- Màn detail hiển thị đúng record được chọn.
- Các field readonly / disabled đúng trạng thái.

### Common Expected Result

- Màn hình được khởi tạo đúng trạng thái, dữ liệu ban đầu chính xác.

---

## VP-03. Navigation / 画面遷移

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-03 |
| Viewpoint Name | Navigation / 画面遷移 |
| Applicable Screen | Tất cả màn hình |
| Priority | High |
| Test Type | Normal, Abnormal |

### Checkpoints

- Chuyển màn hình đúng khi bấm button/link.
- Flow chuẩn hoạt động đúng: list → detail → edit → confirm → complete.
- Button Back / Cancel / Return hoạt động đúng.
- Sau submit thành công chuyển đến màn complete hoặc list đúng yêu cầu.
- Khi lỗi validation, không chuyển màn sai.
- URL không bị sai path hoặc thiếu parameter.
- Breadcrumb điều hướng đúng.
- Điều hướng theo menu đúng quyền user.

### Common Expected Result

- Người dùng được điều hướng đúng màn hình, đúng flow nghiệp vụ.

---

## VP-04. Button / Link Action / ボタン・リンク動作

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-04 |
| Viewpoint Name | Button / Link Action / ボタン・リンク動作 |
| Applicable Screen | Tất cả màn hình |
| Priority | High |
| Test Type | Normal, Abnormal, Usability |

### Checkpoints

- Button hiển thị đúng theo quyền và trạng thái dữ liệu.
- Button thực hiện đúng action.
- Link mở đúng màn hình / đúng tab nếu có yêu cầu.
- Button disabled khi không được thao tác.
- Bấm nhiều lần liên tục không tạo dữ liệu trùng.
- Button nguy hiểm như Delete / Approve có confirm nếu specification yêu cầu.
- Button Cancel không lưu dữ liệu.
- Button Clear reset đúng input.

### Common Expected Result

- Tất cả button/link hoạt động đúng chức năng, không gây side effect ngoài ý muốn.

---

## VP-05. Input Validation - Required / 必須チェック

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-05 |
| Viewpoint Name | Input Validation - Required / 必須チェック |
| Applicable Screen | Create, Edit, Search nếu có field bắt buộc |
| Priority | High |
| Test Type | Abnormal |

### Checkpoints

- Field bắt buộc không nhập thì hiển thị lỗi.
- Dropdown bắt buộc không chọn thì hiển thị lỗi.
- Checkbox bắt buộc chưa check thì hiển thị lỗi.
- Radio bắt buộc chưa chọn thì hiển thị lỗi.
- Field chỉ nhập space được xử lý theo rule: trim hoặc báo lỗi.
- Message lỗi hiển thị đúng vị trí.
- Sau lỗi validation, dữ liệu đã nhập không bị mất.

### Common Expected Result

- Không cho submit khi thiếu field bắt buộc, hiển thị message phù hợp.

---

## VP-06. Input Validation - Length / 桁数チェック

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-06 |
| Viewpoint Name | Input Validation - Length / 桁数チェック |
| Applicable Screen | Create, Edit, Search |
| Priority | High |
| Test Type | Boundary, Abnormal |

### Checkpoints

- Input đúng max length được chấp nhận.
- Input vượt max length bị báo lỗi hoặc bị giới hạn nhập theo specification.
- Input dưới min length bị báo lỗi nếu có min length.
- Kiểm tra 0 ký tự, 1 ký tự, min-1, min, min+1, max-1, max, max+1.
- Với tiếng Nhật, xác định length tính theo ký tự hay byte.
- Copy paste chuỗi dài vào input được xử lý đúng.

### Common Expected Result

- Hệ thống validate đúng độ dài input, không lưu dữ liệu vượt giới hạn DB.

---

## VP-07. Input Validation - Format / 形式チェック

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-07 |
| Viewpoint Name | Input Validation - Format / 形式チェック |
| Applicable Screen | Create, Edit, Search |
| Priority | High |
| Test Type | Abnormal, Boundary |

### Checkpoints

- Email đúng/sai format.
- Phone number đúng/sai format.
- Postal code đúng/sai format.
- Date đúng/sai format.
- Number đúng/sai format.
- URL đúng/sai format nếu có.
- Mã code chỉ cho phép ký tự theo rule.
- Full-width / half-width được xử lý đúng.
- Ký tự đặc biệt được chấp nhận hoặc reject theo specification.

### Common Expected Result

- Chỉ dữ liệu đúng format được chấp nhận, dữ liệu sai format hiển thị lỗi rõ ràng.

---

## VP-08. Input Validation - Range / 範囲チェック

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-08 |
| Viewpoint Name | Input Validation - Range / 範囲チェック |
| Applicable Screen | Create, Edit, Search, Report |
| Priority | High |
| Test Type | Boundary, Abnormal |

### Checkpoints

- Giá trị nhỏ hơn min bị lỗi.
- Giá trị bằng min được chấp nhận.
- Giá trị bằng max được chấp nhận.
- Giá trị lớn hơn max bị lỗi.
- Ngày bắt đầu > ngày kết thúc bị lỗi.
- From/To number bị đảo ngược thì xử lý đúng.
- Giá trị âm được chấp nhận hoặc reject theo rule.
- Số thập phân, rounding, scale được xử lý đúng.

### Common Expected Result

- Hệ thống kiểm tra đúng phạm vi giá trị và hiển thị lỗi khi ngoài phạm vi.

---

## VP-09. Input Validation - Character Type / 文字種チェック

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-09 |
| Viewpoint Name | Input Validation - Character Type / 文字種チェック |
| Applicable Screen | Create, Edit, Search |
| Priority | Medium |
| Test Type | Abnormal, Boundary |

### Checkpoints

- Half-width number: `12345`.
- Full-width number: `１２３４５`.
- Half-width alphabet: `abcABC`.
- Full-width alphabet: `ａｂｃＡＢＣ`.
- Hiragana: `ひらがな`.
- Katakana: `カタカナ`.
- Half-width Katakana: `ｶﾀｶﾅ`.
- Kanji: `漢字`.
- Symbol: `!@#$%^&*()`.
- Emoji hoặc ký tự môi trường phụ thuộc.
- Space half-width và full-width.

### Common Expected Result

- Hệ thống accept/reject/convert đúng theo rule từng field.

---

## VP-10. Search Condition / 検索条件

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-10 |
| Viewpoint Name | Search Condition / 検索条件 |
| Applicable Screen | Search, List, Report |
| Priority | High |
| Test Type | Normal, Boundary, Abnormal |

### Checkpoints

- Search với một điều kiện.
- Search với nhiều điều kiện.
- Search không nhập điều kiện.
- Search với điều kiện không có kết quả.
- Search partial match / exact match theo specification.
- Search case-sensitive hoặc case-insensitive theo specification.
- Search với khoảng ngày từ - đến.
- Search với deleted/active status nếu có.
- Clear condition hoạt động đúng.
- Search condition được giữ lại khi paging/detail/back nếu specification yêu cầu.

### Common Expected Result

- Kết quả tìm kiếm đúng với điều kiện đầu vào và rule nghiệp vụ.

---

## VP-11. List Display / 一覧表示

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-11 |
| Viewpoint Name | List Display / 一覧表示 |
| Applicable Screen | List, Search Result |
| Priority | High |
| Test Type | Normal, Boundary |

### Checkpoints

- Có dữ liệu thì hiển thị đúng số dòng.
- Không có dữ liệu thì hiển thị message đúng.
- Dữ liệu nhiều dòng không vỡ layout.
- Column hiển thị đúng thứ tự.
- Dữ liệu từng column đúng format.
- Dữ liệu master hiển thị name thay vì code nếu yêu cầu.
- Long text được cắt dòng / tooltip / wrap đúng specification.
- Các action trong từng dòng hiển thị đúng.

### Common Expected Result

- Danh sách hiển thị đúng dữ liệu, đúng format, đúng rule.

---

## VP-12. Pagination / ページング

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-12 |
| Viewpoint Name | Pagination / ページング |
| Applicable Screen | List, Search Result |
| Priority | Medium |
| Test Type | Normal, Boundary |

### Checkpoints

- Hiển thị đúng số record mỗi page.
- Page đầu, page giữa, page cuối hoạt động đúng.
- Next / Previous hoạt động đúng.
- First / Last hoạt động đúng nếu có.
- Khi không có dữ liệu, paging không hiển thị hoặc disabled đúng.
- Khi chỉ có một page, paging xử lý đúng.
- Search condition được giữ khi chuyển page.
- Tổng số record / tổng số page hiển thị đúng nếu có.

### Common Expected Result

- Paging hoạt động đúng, không mất điều kiện tìm kiếm và không hiển thị sai dữ liệu.

---

## VP-13. Sorting / ソート

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-13 |
| Viewpoint Name | Sorting / ソート |
| Applicable Screen | List, Search Result |
| Priority | Medium |
| Test Type | Normal |

### Checkpoints

- Sort ascending đúng.
- Sort descending đúng.
- Sort theo number đúng thứ tự số.
- Sort theo date đúng thứ tự ngày.
- Sort theo text đúng rule.
- Sort theo Japanese text nếu có yêu cầu.
- Search condition được giữ sau khi sort.
- Sort kết hợp paging không sai dữ liệu.
- Default sort đúng specification.

### Common Expected Result

- Dữ liệu được sắp xếp đúng theo column và thứ tự được chọn.

---

## VP-14. Detail Display / 詳細表示

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-14 |
| Viewpoint Name | Detail Display / 詳細表示 |
| Applicable Screen | Detail |
| Priority | High |
| Test Type | Normal, Abnormal |

### Checkpoints

- Hiển thị đúng dữ liệu của record được chọn.
- ID không tồn tại thì hiển thị lỗi hoặc 404 theo specification.
- Record đã bị xóa logic thì xử lý đúng.
- Dữ liệu liên kết hiển thị đúng.
- Field nhạy cảm không được hiển thị nếu không có quyền.
- Button Edit/Delete/Back hiển thị đúng theo quyền và trạng thái.

### Common Expected Result

- Màn detail hiển thị chính xác thông tin record và xử lý đúng record không hợp lệ.

---

## VP-15. Create / 登録

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-15 |
| Viewpoint Name | Create / 登録 |
| Applicable Screen | Create |
| Priority | High |
| Test Type | Normal, Abnormal, Data |

### Checkpoints

- Nhập dữ liệu hợp lệ và đăng ký thành công.
- Dữ liệu được lưu đúng DB.
- created_at, created_by được set đúng.
- Default value được lưu đúng.
- Duplicate check hoạt động đúng nếu có.
- Sau đăng ký chuyển màn đúng.
- Sau lỗi validation không lưu DB.
- Reload complete không tạo thêm record nếu sử dụng redirect đúng.

### Common Expected Result

- Dữ liệu hợp lệ được tạo mới chính xác, dữ liệu lỗi không được lưu.

---

## VP-16. Update / 更新

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-16 |
| Viewpoint Name | Update / 更新 |
| Applicable Screen | Edit |
| Priority | High |
| Test Type | Normal, Abnormal, Data |

### Checkpoints

- Load dữ liệu hiện tại đúng.
- Cập nhật dữ liệu hợp lệ thành công.
- Chỉ field được phép sửa mới thay đổi.
- updated_at, updated_by được set đúng.
- created_at, created_by không bị thay đổi.
- Duplicate check khi update hoạt động đúng.
- Sau lỗi validation không update DB.
- Record không tồn tại hoặc đã bị xóa được xử lý đúng.

### Common Expected Result

- Dữ liệu được cập nhật đúng rule, đúng DB, không làm thay đổi field không liên quan.

---

## VP-17. Delete / 削除

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-17 |
| Viewpoint Name | Delete / 削除 |
| Applicable Screen | Detail, List, Edit |
| Priority | High |
| Test Type | Normal, Abnormal, Data |

### Checkpoints

- Delete thành công với record hợp lệ.
- Có confirm trước khi delete nếu yêu cầu.
- Logical delete cập nhật delete flag đúng.
- Physical delete xóa record đúng nếu yêu cầu.
- Record đã xóa không hiển thị trên list nếu rule yêu cầu.
- Không delete được record đang được tham chiếu nếu có ràng buộc.
- User không có quyền không thấy hoặc không thao tác được delete.
- Delete record không tồn tại xử lý đúng.

### Common Expected Result

- Delete hoạt động đúng rule, không gây mất dữ liệu ngoài ý muốn.

---

## VP-18. Confirm Screen / 確認画面

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-18 |
| Viewpoint Name | Confirm Screen / 確認画面 |
| Applicable Screen | Confirm |
| Priority | Medium |
| Test Type | Normal, Usability |

### Checkpoints

- Dữ liệu trên confirm khớp với dữ liệu đã nhập.
- Format hiển thị trên confirm đúng.
- Hidden field giữ đúng giá trị khi submit từ confirm.
- Button Back từ confirm quay lại input và giữ dữ liệu.
- Button Submit từ confirm lưu đúng dữ liệu.
- Không cho sửa trực tiếp dữ liệu ở confirm nếu không yêu cầu.

### Common Expected Result

- Màn confirm hiển thị đúng dữ liệu trước khi lưu và không làm mất dữ liệu input.

---

## VP-19. Complete Screen / 完了画面

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-19 |
| Viewpoint Name | Complete Screen / 完了画面 |
| Applicable Screen | Complete |
| Priority | Medium |
| Test Type | Normal, Usability |

### Checkpoints

- Message hoàn tất hiển thị đúng.
- Không hiển thị thông tin lỗi sau khi thành công.
- Link/Button quay lại list/detail/create hoạt động đúng.
- Reload complete không tạo duplicate data.
- Back browser từ complete không gây submit lại ngoài ý muốn.

### Common Expected Result

- Màn complete xác nhận thao tác thành công và không gây duplicate submit.

---

## VP-20. Business Rule / 業務ルール

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-20 |
| Viewpoint Name | Business Rule / 業務ルール |
| Applicable Screen | Tất cả màn hình có nghiệp vụ |
| Priority | High |
| Test Type | Normal, Abnormal, Boundary |

### Checkpoints

- Rule tính toán đúng.
- Rule bắt buộc theo điều kiện đúng.
- Rule trạng thái đúng.
- Rule duplicate đúng.
- Rule liên kết master đúng.
- Rule ngày hiệu lực đúng.
- Rule phân quyền theo trạng thái đúng.
- Rule không cho sửa/xóa dữ liệu đã hoàn tất hoặc đã duyệt đúng.
- Rule đặc thù khách hàng được phản ánh đúng.

### Common Expected Result

- Tất cả rule nghiệp vụ hoạt động đúng như specification.

---

## VP-21. Status Transition / ステータス遷移

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-21 |
| Viewpoint Name | Status Transition / ステータス遷移 |
| Applicable Screen | Workflow, Approval, Order, Request |
| Priority | High |
| Test Type | Normal, Abnormal |

### Checkpoints

- Trạng thái được chuyển đúng flow.
- Không cho chuyển trạng thái sai flow.
- Button/action hiển thị theo trạng thái hiện tại.
- Sau khi chuyển trạng thái, dữ liệu readonly đúng.
- Người không có quyền không được chuyển trạng thái.
- Lịch sử trạng thái được lưu nếu có yêu cầu.
- Message sau chuyển trạng thái đúng.

### Common Expected Result

- Status transition tuân thủ đúng workflow nghiệp vụ.

---

## VP-22. Authentication / 認証

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-22 |
| Viewpoint Name | Authentication / 認証 |
| Applicable Screen | Login, Logout, toàn hệ thống |
| Priority | High |
| Test Type | Security, Abnormal |

### Checkpoints

- Login thành công với account hợp lệ.
- Login thất bại với password sai.
- Login thất bại với user không tồn tại.
- Account locked/inactive không login được nếu có rule.
- Logout thành công và session bị hủy.
- Chưa login không truy cập được màn nội bộ.
- Sau logout, Back browser không xem lại được dữ liệu bảo mật.
- Session timeout xử lý đúng.

### Common Expected Result

- Chỉ user hợp lệ mới đăng nhập được, session được quản lý an toàn.

---

## VP-23. Authorization / 権限

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-23 |
| Viewpoint Name | Authorization / 権限 |
| Applicable Screen | Tất cả màn hình |
| Priority | High |
| Test Type | Security |

### Checkpoints

- Role khác nhau thấy menu khác nhau.
- Role không có quyền không truy cập được URL trực tiếp.
- Role chỉ xem không thực hiện được create/update/delete.
- Button/action bị ẩn hoặc disabled đúng theo quyền.
- API/POST action cũng kiểm tra quyền, không chỉ kiểm tra ở UI.
- Dữ liệu theo phạm vi quyền được filter đúng.
- User A không xem/sửa dữ liệu của user B nếu không có quyền.

### Common Expected Result

- Quyền được kiểm tra đầy đủ ở cả UI và server-side.

---

## VP-24. Session Management / セッション管理

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-24 |
| Viewpoint Name | Session Management / セッション管理 |
| Applicable Screen | Tất cả màn hình |
| Priority | High |
| Test Type | Security, Abnormal |

### Checkpoints

- Session timeout khi không thao tác trong thời gian quy định.
- Submit form sau timeout được redirect về login hoặc báo lỗi đúng.
- Session data không bị lẫn giữa user.
- Login user khác trên cùng browser xử lý đúng.
- Dữ liệu tạm trong session được clear đúng lúc.
- Không lưu thông tin nhạy cảm không cần thiết trong session.

### Common Expected Result

- Session hoạt động an toàn, không làm sai dữ liệu hoặc lộ thông tin.

---

## VP-25. Browser Back / Reload / Multi-tab / ブラウザ操作

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-25 |
| Viewpoint Name | Browser Back / Reload / Multi-tab / ブラウザ操作 |
| Applicable Screen | Create, Edit, Delete, Confirm, Complete |
| Priority | Medium |
| Test Type | Abnormal, Usability |

### Checkpoints

- Back browser sau submit không tạo duplicate.
- Reload màn input không gây lỗi.
- Reload màn complete không submit lại.
- Mở cùng form ở nhiều tab và submit xử lý đúng.
- Back từ confirm về input giữ dữ liệu đúng.
- Bookmark URL cũ xử lý đúng.
- Truy cập lại URL complete cũ xử lý đúng.

### Common Expected Result

- Các thao tác browser bất thường không làm sai dữ liệu hoặc gây lỗi hệ thống.

---

## VP-26. Double Submit / 二重送信

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-26 |
| Viewpoint Name | Double Submit / 二重送信 |
| Applicable Screen | Create, Edit, Delete, Approval |
| Priority | High |
| Test Type | Abnormal, Data |

### Checkpoints

- Double click submit không tạo record trùng.
- Submit liên tục không update sai trạng thái.
- Reload sau POST không submit lại.
- Token chống double submit hoạt động nếu có.
- Button submit disabled sau lần click đầu nếu specification yêu cầu.

### Common Expected Result

- Không phát sinh duplicate data hoặc xử lý nghiệp vụ lặp ngoài ý muốn.

---

## VP-27. Concurrency / 排他制御

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-27 |
| Viewpoint Name | Concurrency / 排他制御 |
| Applicable Screen | Edit, Delete, Approval |
| Priority | High |
| Test Type | Abnormal, Data |

### Checkpoints

- Hai user cùng edit một record.
- User sau update bị báo conflict nếu optimistic lock được áp dụng.
- User update record đã bị user khác delete.
- User delete record đã bị user khác update.
- Version number / updated_at được kiểm tra đúng.
- Message conflict dễ hiểu.
- Sau conflict, màn hình hướng dẫn thao tác tiếp theo rõ ràng.

### Common Expected Result

- Hệ thống ngăn ghi đè dữ liệu ngoài ý muốn khi có thao tác đồng thời.

---

## VP-28. Database Consistency / DB整合性

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-28 |
| Viewpoint Name | Database Consistency / DB整合性 |
| Applicable Screen | Create, Edit, Delete, Import, Approval |
| Priority | High |
| Test Type | Data |

### Checkpoints

- Insert đúng table, đúng column.
- Update đúng table, đúng column.
- Delete đúng rule: logical/physical.
- Không update nhầm record.
- Foreign key / relation được lưu đúng.
- Audit column được lưu đúng.
- Null/default value đúng.
- Transaction rollback khi có lỗi.
- Không phát sinh dữ liệu rác sau lỗi.

### Common Expected Result

- Dữ liệu DB nhất quán với thao tác người dùng và rule nghiệp vụ.

---

## VP-29. Transaction / トランザクション

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-29 |
| Viewpoint Name | Transaction / トランザクション |
| Applicable Screen | Create, Edit, Delete, Import, Batch-like operation |
| Priority | High |
| Test Type | Data, Abnormal |

### Checkpoints

- Nhiều table update cùng lúc thì commit đồng bộ.
- Khi lỗi giữa chừng thì rollback toàn bộ.
- Không có trạng thái dữ liệu nửa vời.
- Message lỗi đúng khi transaction failed.
- Retry sau lỗi hoạt động đúng.

### Common Expected Result

- Transaction đảm bảo tính toàn vẹn dữ liệu.

---

## VP-30. Error Handling / エラーハンドリング

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-30 |
| Viewpoint Name | Error Handling / エラーハンドリング |
| Applicable Screen | Tất cả màn hình |
| Priority | High |
| Test Type | Abnormal, Usability |

### Checkpoints

- Validation error hiển thị đúng.
- Business error hiển thị đúng.
- System error hiển thị error page phù hợp.
- 404 khi URL không tồn tại.
- 403 khi không có quyền.
- 500 không hiển thị stacktrace cho user.
- Lỗi DB được xử lý đúng.
- Message lỗi rõ ràng, không lộ thông tin nhạy cảm.
- Log lỗi được ghi đủ để điều tra.

### Common Expected Result

- Lỗi được xử lý an toàn, thân thiện, không làm lộ thông tin hệ thống.

---

## VP-31. Message / メッセージ

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-31 |
| Viewpoint Name | Message / メッセージ |
| Applicable Screen | Tất cả màn hình |
| Priority | Medium |
| Test Type | Usability |

### Checkpoints

- Message thành công đúng nội dung.
- Message lỗi đúng nội dung.
- Message confirm đúng nội dung.
- Message validation theo từng field đúng.
- Message tiếng Nhật tự nhiên, không sai chính tả.
- Placeholder/label/message thống nhất thuật ngữ.
- Message không quá kỹ thuật với end-user.

### Common Expected Result

- Message rõ ràng, đúng ngôn ngữ, đúng ngữ cảnh.

---

## VP-32. Security - XSS / クロスサイトスクリプティング

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-32 |
| Viewpoint Name | Security - XSS / クロスサイトスクリプティング |
| Applicable Screen | Input, Search, Detail, List, Comment, Master |
| Priority | High |
| Test Type | Security |

### Checkpoints

- Nhập `<script>alert(1)</script>` vào text field.
- Nhập HTML tag vào field hiển thị lại trên list/detail.
- Search keyword chứa script không được execute.
- Error message không render script.
- Thymeleaf escaping hoạt động đúng.
- Field cho phép HTML nếu có phải sanitize đúng.

### Common Expected Result

- Script không được thực thi trên browser, dữ liệu được escape/sanitize đúng.

---

## VP-33. Security - SQL Injection / SQLインジェクション

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-33 |
| Viewpoint Name | Security - SQL Injection / SQLインジェクション |
| Applicable Screen | Search, Login, Input forms |
| Priority | High |
| Test Type | Security |

### Checkpoints

- Nhập `' OR '1'='1` vào search/login.
- Nhập SQL keyword vào input.
- Search không trả về dữ liệu ngoài điều kiện.
- Không phát sinh SQL error trên màn hình.
- Query dùng parameter binding đúng.
- Log không ghi dữ liệu nhạy cảm quá mức.

### Common Expected Result

- Injection không làm thay đổi logic query hoặc gây lỗi hệ thống.

---

## VP-34. Security - CSRF / CSRF対策

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-34 |
| Viewpoint Name | Security - CSRF / CSRF対策 |
| Applicable Screen | Tất cả POST/PUT/DELETE forms |
| Priority | High |
| Test Type | Security |

### Checkpoints

- Form POST có CSRF token.
- Request không có CSRF token bị reject.
- Request có token sai bị reject.
- Token hết hạn xử lý đúng.
- GET request không làm thay đổi dữ liệu.

### Common Expected Result

- Các thao tác thay đổi dữ liệu được bảo vệ khỏi CSRF.

---

## VP-35. Security - Direct URL Access / URL直接アクセス

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-35 |
| Viewpoint Name | Security - Direct URL Access / URL直接アクセス |
| Applicable Screen | Detail, Edit, Delete, Admin, Approval |
| Priority | High |
| Test Type | Security |

### Checkpoints

- Chưa login truy cập URL nội bộ.
- User không có quyền truy cập URL admin.
- User gõ trực tiếp URL edit/delete.
- User sửa ID trên URL để xem dữ liệu khác.
- URL với ID không tồn tại xử lý đúng.
- URL với parameter thiếu/sai kiểu xử lý đúng.

### Common Expected Result

- Server-side kiểm tra quyền và tính hợp lệ của URL/parameter đầy đủ.

---

## VP-36. File Upload / ファイルアップロード

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-36 |
| Viewpoint Name | File Upload / ファイルアップロード |
| Applicable Screen | Upload, Import, Attachment |
| Priority | High nếu có upload |
| Test Type | Normal, Abnormal, Security |

### Checkpoints

- Upload file hợp lệ thành công.
- Không chọn file thì xử lý đúng.
- File sai extension bị reject.
- File vượt dung lượng bị reject.
- File rỗng xử lý đúng.
- File tên tiếng Nhật xử lý đúng.
- File tên quá dài xử lý đúng.
- File có ký tự đặc biệt trong tên xử lý đúng.
- File giả mạo extension được kiểm tra nếu yêu cầu.
- Virus scan nếu có yêu cầu.
- Upload thất bại không tạo dữ liệu rác.

### Common Expected Result

- Chỉ file hợp lệ được upload/xử lý, file nguy hiểm hoặc sai rule bị chặn.

---

## VP-37. File Download / ファイルダウンロード

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-37 |
| Viewpoint Name | File Download / ファイルダウンロード |
| Applicable Screen | Download, Export |
| Priority | Medium đến High |
| Test Type | Normal, Security |

### Checkpoints

- Download file thành công.
- Tên file đúng format.
- Nội dung file đúng dữ liệu.
- Encoding tiếng Nhật không lỗi.
- User không có quyền không download được.
- File không tồn tại xử lý đúng.
- Export với không có dữ liệu xử lý đúng.
- Export với nhiều dữ liệu xử lý đúng.

### Common Expected Result

- File được download đúng nội dung, đúng quyền, đúng encoding.

---

## VP-38. CSV Import / CSVインポート

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-38 |
| Viewpoint Name | CSV Import / CSVインポート |
| Applicable Screen | CSV Import |
| Priority | High nếu có import |
| Test Type | Normal, Abnormal, Data |

### Checkpoints

- Import file hợp lệ thành công.
- Header đúng/sai.
- Thiếu column bắt buộc.
- Thừa column.
- Dữ liệu sai format trong từng dòng.
- Một số dòng lỗi thì xử lý all-or-nothing hoặc partial theo specification.
- Encoding UTF-8/Shift-JIS theo yêu cầu.
- Duplicate trong file.
- Duplicate với DB.
- Số lượng dòng lớn.
- Kết quả import/error report đúng.

### Common Expected Result

- CSV được validate và import đúng rule, lỗi được báo rõ ràng.

---

## VP-39. CSV Export / CSVエクスポート

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-39 |
| Viewpoint Name | CSV Export / CSVエクスポート |
| Applicable Screen | CSV Export, Report |
| Priority | Medium đến High |
| Test Type | Normal, Data |

### Checkpoints

- Export đúng điều kiện tìm kiếm.
- Header đúng.
- Thứ tự column đúng.
- Format ngày/số/text đúng.
- Encoding tiếng Nhật đúng.
- Dữ liệu có dấu phẩy, xuống dòng, quote được escape đúng.
- Export khi không có dữ liệu.
- Export nhiều dữ liệu.
- Tên file đúng format.

### Common Expected Result

- CSV export đúng dữ liệu, đúng format, mở được bằng công cụ khách hàng sử dụng.

---

## VP-40. Date / Time / Number Format / 日付・時刻・数値フォーマット

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-40 |
| Viewpoint Name | Date / Time / Number Format / 日付・時刻・数値フォーマット |
| Applicable Screen | Tất cả màn hình có ngày, giờ, số tiền, số lượng |
| Priority | Medium |
| Test Type | Normal, Boundary |

### Checkpoints

- Date format đúng: ví dụ `yyyy/MM/dd` nếu khách hàng Nhật yêu cầu.
- Time format đúng: `HH:mm`, `HH:mm:ss`.
- Timezone đúng: Japan time nếu hệ thống vận hành theo Nhật.
- Number format đúng dấu phẩy phân tách hàng nghìn.
- Decimal scale đúng.
- Rounding đúng.
- Negative number hiển thị đúng nếu có.
- Percent/currency format đúng.

### Common Expected Result

- Ngày, giờ, số được hiển thị và lưu đúng format/rule.

---

## VP-41. Japanese Specific / 日本語固有観点

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-41 |
| Viewpoint Name | Japanese Specific / 日本語固有観点 |
| Applicable Screen | Hệ thống dùng tiếng Nhật hoặc dữ liệu tiếng Nhật |
| Priority | Medium đến High |
| Test Type | Usability, Boundary |

### Checkpoints

- Kanji/Hiragana/Katakana hiển thị đúng.
- Full-width/Half-width xử lý đúng.
- Kana field chỉ cho phép Katakana nếu rule yêu cầu.
- Postal code Nhật format đúng.
- Phone number Nhật format đúng.
- Address Nhật hiển thị đúng thứ tự.
- CSV import/export không lỗi mojibake.
- Message tiếng Nhật đúng thuật ngữ khách hàng.
- Sort/filter tiếng Nhật đúng kỳ vọng nếu có yêu cầu.

### Common Expected Result

- Hệ thống xử lý tốt dữ liệu và UI tiếng Nhật.

---

## VP-42. Master Data / マスタデータ

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-42 |
| Viewpoint Name | Master Data / マスタデータ |
| Applicable Screen | Create, Edit, Search, Master Maintenance |
| Priority | High |
| Test Type | Normal, Data |

### Checkpoints

- Dropdown lấy đúng master active.
- Master inactive không hiển thị nếu rule yêu cầu.
- Master đã xóa không được chọn mới.
- Dữ liệu cũ dùng master inactive vẫn hiển thị đúng nếu rule yêu cầu.
- Master có effective date được filter đúng.
- Parent-child master hoạt động đúng.
- Code/name mapping đúng.

### Common Expected Result

- Dữ liệu master được sử dụng đúng trong input, display và business rule.

---

## VP-43. Logging / ログ

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-43 |
| Viewpoint Name | Logging / ログ |
| Applicable Screen | Tất cả chức năng quan trọng |
| Priority | Medium |
| Test Type | Data, Security |

### Checkpoints

- Log lỗi được ghi khi system error.
- Log thao tác quan trọng được ghi nếu yêu cầu.
- Log có đủ user ID, timestamp, action, target ID.
- Không ghi password/token/thông tin nhạy cảm vào log.
- Log level phù hợp.
- Trace ID/request ID nếu hệ thống có sử dụng.

### Common Expected Result

- Log đủ để điều tra lỗi nhưng không làm lộ thông tin nhạy cảm.

---

## VP-44. Audit Trail / 監査項目

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-44 |
| Viewpoint Name | Audit Trail / 監査項目 |
| Applicable Screen | Create, Edit, Delete, Approval |
| Priority | High nếu có yêu cầu audit |
| Test Type | Data |

### Checkpoints

- created_by được lưu đúng.
- created_at được lưu đúng.
- updated_by được lưu đúng.
- updated_at được lưu đúng.
- deleted_by/deleted_at được lưu đúng nếu logical delete.
- approved_by/approved_at được lưu đúng nếu approval.
- Lịch sử thay đổi được lưu nếu có yêu cầu.

### Common Expected Result

- Thông tin audit phản ánh chính xác người thao tác và thời điểm thao tác.

---

## VP-45. Performance Basic / 性能基本観点

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-45 |
| Viewpoint Name | Performance Basic / 性能基本観点 |
| Applicable Screen | Search, List, Export, Import, Report |
| Priority | Medium |
| Test Type | Normal, Boundary |

### Checkpoints

- Màn search với nhiều dữ liệu phản hồi trong thời gian chấp nhận được.
- Paging không load toàn bộ dữ liệu nếu không cần thiết.
- Export dữ liệu lớn không timeout nếu trong phạm vi yêu cầu.
- Import dữ liệu lớn xử lý đúng.
- Màn detail không gọi query dư thừa quá mức.
- Không phát sinh N+1 query nghiêm trọng nếu có thể kiểm tra.

### Common Expected Result

- Chức năng phản hồi trong ngưỡng chấp nhận được với volume dữ liệu dự kiến.

---

## VP-46. Browser Compatibility / ブラウザ互換性

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-46 |
| Viewpoint Name | Browser Compatibility / ブラウザ互換性 |
| Applicable Screen | Tất cả màn hình UI |
| Priority | Low đến Medium |
| Test Type | Usability |

### Checkpoints

- Chrome hiển thị và thao tác đúng.
- Edge hiển thị và thao tác đúng.
- Safari nếu khách hàng yêu cầu.
- Date picker/select/input hoạt động nhất quán.
- Download/upload hoạt động trên browser target.
- Không có lỗi JavaScript nghiêm trọng trên console nếu kiểm tra được.

### Common Expected Result

- Hệ thống hoạt động đúng trên các browser được support.

---

## VP-47. Responsive / Layout Adaptation / レスポンシブ

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-47 |
| Viewpoint Name | Responsive / Layout Adaptation / レスポンシブ |
| Applicable Screen | Tất cả màn hình nếu có yêu cầu responsive |
| Priority | Low đến Medium |
| Test Type | Usability |

### Checkpoints

- Layout desktop đúng.
- Layout tablet/mobile nếu có yêu cầu.
- Table không bị vỡ nghiêm trọng.
- Button/input vẫn thao tác được.
- Menu/header không che nội dung.
- Long text không làm tràn màn hình.

### Common Expected Result

- Layout phù hợp với thiết bị/kích thước màn hình được support.

---

## VP-48. Accessibility Basic / アクセシビリティ基本

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-48 |
| Viewpoint Name | Accessibility Basic / アクセシビリティ基本 |
| Applicable Screen | Tất cả màn hình nếu có yêu cầu |
| Priority | Low đến Medium |
| Test Type | Usability |

### Checkpoints

- Tab order hợp lý.
- Label liên kết đúng với input.
- Error message dễ nhận biết.
- Button có text rõ ràng.
- Màu sắc không phải là cách duy nhất để truyền đạt lỗi/trạng thái.
- Có thể thao tác cơ bản bằng keyboard nếu yêu cầu.

### Common Expected Result

- Người dùng có thể thao tác và hiểu màn hình dễ dàng hơn.

---

## VP-49. Spring Boot MVC Specific / Spring Boot MVC固有観点

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-49 |
| Viewpoint Name | Spring Boot MVC Specific / Spring Boot MVC固有観点 |
| Applicable Screen | Spring Boot MVC application |
| Priority | Medium |
| Test Type | Normal, Abnormal, Security |

### Checkpoints

- URL mapping đúng.
- HTTP method đúng: GET cho display, POST cho submit.
- Controller nhận đúng request parameter/form object.
- ModelAttribute truyền dữ liệu đúng sang view.
- BindingResult xử lý validation error đúng.
- Redirect sau POST đúng để tránh double submit.
- ControllerAdvice xử lý exception đúng.
- Service transaction hoạt động đúng.
- Repository query trả đúng dữ liệu.
- CSRF token được tích hợp đúng với form.

### Common Expected Result

- Luồng MVC hoạt động đúng từ request → controller → service → repository → view.

---

## VP-50. Thymeleaf Specific / Thymeleaf固有観点

| Item | Nội dung |
|---|---|
| Viewpoint ID | VP-50 |
| Viewpoint Name | Thymeleaf Specific / Thymeleaf固有観点 |
| Applicable Screen | Thymeleaf templates |
| Priority | Medium |
| Test Type | Normal, Usability, Security |

### Checkpoints

- `th:field` bind đúng giá trị input.
- `th:text` escape đúng dữ liệu.
- `th:utext` chỉ dùng khi thật sự cần và có sanitize.
- `th:if` / `th:unless` hiển thị đúng điều kiện.
- `th:each` lặp đúng danh sách.
- Selected option trong dropdown đúng.
- Checked state của checkbox/radio đúng.
- Error message từ BindingResult hiển thị đúng.
- Hidden field giữ đúng value cần thiết.
- Fragment/layout common render đúng.

### Common Expected Result

- Template render đúng dữ liệu, đúng điều kiện và an toàn với dữ liệu người dùng nhập.

---

# 6. Mapping viewpoint theo loại màn hình

## 6.1 Login Screen

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-01 | Yes |
| VP-03 | Yes |
| VP-05 | Yes |
| VP-07 | Yes |
| VP-22 | Yes |
| VP-24 | Yes |
| VP-30 | Yes |
| VP-31 | Yes |
| VP-33 | Yes |
| VP-46 | Optional |

## 6.2 Search/List Screen

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-01 | Yes |
| VP-02 | Yes |
| VP-03 | Yes |
| VP-04 | Yes |
| VP-07 | Yes |
| VP-10 | Yes |
| VP-11 | Yes |
| VP-12 | Yes nếu có paging |
| VP-13 | Yes nếu có sort |
| VP-23 | Yes |
| VP-30 | Yes |
| VP-31 | Yes |
| VP-32 | Yes |
| VP-33 | Yes |
| VP-35 | Yes |
| VP-40 | Optional |
| VP-41 | Optional |
| VP-45 | Optional |

## 6.3 Detail Screen

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-01 | Yes |
| VP-03 | Yes |
| VP-04 | Yes |
| VP-14 | Yes |
| VP-20 | Yes nếu có nghiệp vụ |
| VP-23 | Yes |
| VP-30 | Yes |
| VP-31 | Yes |
| VP-32 | Yes |
| VP-35 | Yes |
| VP-40 | Optional |
| VP-42 | Optional |

## 6.4 Create Screen

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-01 | Yes |
| VP-02 | Yes |
| VP-03 | Yes |
| VP-04 | Yes |
| VP-05 | Yes |
| VP-06 | Yes |
| VP-07 | Yes |
| VP-08 | Yes nếu có range |
| VP-09 | Optional |
| VP-15 | Yes |
| VP-18 | Yes nếu có confirm |
| VP-19 | Yes nếu có complete |
| VP-20 | Yes |
| VP-23 | Yes |
| VP-25 | Yes |
| VP-26 | Yes |
| VP-28 | Yes |
| VP-29 | Yes nếu nhiều table |
| VP-30 | Yes |
| VP-31 | Yes |
| VP-32 | Yes |
| VP-34 | Yes |
| VP-40 | Optional |
| VP-41 | Optional |
| VP-42 | Optional |
| VP-44 | Optional |

## 6.5 Edit Screen

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-01 | Yes |
| VP-02 | Yes |
| VP-03 | Yes |
| VP-04 | Yes |
| VP-05 | Yes |
| VP-06 | Yes |
| VP-07 | Yes |
| VP-08 | Yes nếu có range |
| VP-09 | Optional |
| VP-16 | Yes |
| VP-18 | Yes nếu có confirm |
| VP-19 | Yes nếu có complete |
| VP-20 | Yes |
| VP-23 | Yes |
| VP-25 | Yes |
| VP-26 | Yes |
| VP-27 | Yes nếu có lock |
| VP-28 | Yes |
| VP-29 | Yes nếu nhiều table |
| VP-30 | Yes |
| VP-31 | Yes |
| VP-32 | Yes |
| VP-34 | Yes |
| VP-35 | Yes |
| VP-44 | Optional |

## 6.6 Delete Function

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-04 | Yes |
| VP-17 | Yes |
| VP-20 | Yes nếu có nghiệp vụ |
| VP-23 | Yes |
| VP-25 | Yes |
| VP-26 | Yes |
| VP-27 | Yes nếu có lock |
| VP-28 | Yes |
| VP-29 | Yes nếu có nhiều table |
| VP-30 | Yes |
| VP-31 | Yes |
| VP-34 | Yes |
| VP-35 | Yes |
| VP-44 | Optional |

## 6.7 File Upload / Import Screen

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-01 | Yes |
| VP-03 | Yes |
| VP-04 | Yes |
| VP-23 | Yes |
| VP-28 | Yes |
| VP-29 | Yes |
| VP-30 | Yes |
| VP-31 | Yes |
| VP-36 | Yes |
| VP-38 | Yes nếu CSV import |
| VP-41 | Yes nếu tiếng Nhật |
| VP-45 | Optional |

## 6.8 File Download / Export Screen

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-03 | Yes |
| VP-04 | Yes |
| VP-23 | Yes |
| VP-30 | Yes |
| VP-37 | Yes |
| VP-39 | Yes nếu CSV export |
| VP-41 | Yes nếu tiếng Nhật |
| VP-45 | Optional |

## 6.9 Approval / Workflow Screen

| Viewpoint ID | Bắt buộc |
|---|---|
| VP-01 | Yes |
| VP-03 | Yes |
| VP-04 | Yes |
| VP-20 | Yes |
| VP-21 | Yes |
| VP-23 | Yes |
| VP-25 | Yes |
| VP-26 | Yes |
| VP-27 | Yes |
| VP-28 | Yes |
| VP-29 | Yes |
| VP-30 | Yes |
| VP-31 | Yes |
| VP-34 | Yes |
| VP-35 | Yes |
| VP-44 | Optional |

---

# 7. Test Data Pattern Common

## 7.1 Text

| Pattern | Example |
|---|---|
| Blank | `` |
| Space only | `   ` |
| Half-width text | `abcABC123` |
| Full-width text | `ａｂｃＡＢＣ１２３` |
| Japanese | `山田太郎` |
| Hiragana | `やまだたろう` |
| Katakana | `ヤマダタロウ` |
| Half-width Katakana | `ﾔﾏﾀﾞﾀﾛｳ` |
| Symbol | `!@#$%^&*()` |
| HTML | `<b>test</b>` |
| Script | `<script>alert(1)</script>` |
| SQL Injection | `' OR '1'='1` |
| Long text | Chuỗi vượt max length |

## 7.2 Number

| Pattern | Example |
|---|---|
| Zero | `0` |
| Positive | `123` |
| Negative | `-1` |
| Decimal | `123.45` |
| Large number | `9999999999` |
| Alphabet mixed | `12abc` |
| Comma number | `1,000` |
| Full-width number | `１２３` |

## 7.3 Date

| Pattern | Example |
|---|---|
| Valid date | `2026/05/27` |
| Invalid format | `2026-05-27` |
| Non-existing date | `2026/02/30` |
| Leap year valid | `2024/02/29` |
| Leap year invalid | `2025/02/29` |
| From > To | From `2026/05/28`, To `2026/05/27` |
| Blank date | `` |

## 7.4 File

| Pattern | Example |
|---|---|
| Valid file | `data.csv` |
| Empty file | `empty.csv` |
| Wrong extension | `data.exe` |
| Large file | File vượt dung lượng cho phép |
| Japanese filename | `顧客一覧.csv` |
| Long filename | Tên file vượt giới hạn |
| Special char filename | `test_!@#.csv` |
| Fake extension | `virus.pdf.exe` |

---

# 8. Template generate test case từ viewpoint

Khi generate test case, dùng format sau:

| No | Module | Screen | Function | Viewpoint ID | Viewpoint Name | Test Type | Priority | Preconditions | Test Data | Steps | Expected Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | User Management | User Create | Register User | VP-05 | Required Check | Abnormal | High | Đang login bằng admin | User Name blank | 1. Mở màn create<br>2. Không nhập User Name<br>3. Bấm Register | Hiển thị lỗi bắt buộc, không lưu DB |

---

# 9. Prompt mẫu để generate test case

```text
Bạn là QA lead cho dự án web quản lý Java Spring Boot MVC + Thymeleaf cho khách hàng Nhật.
Dựa vào Common Test Viewpoint Base Knowledge này và specification màn hình bên dưới, hãy generate test case.

Yêu cầu:
- Chọn các viewpoint phù hợp với loại màn hình.
- Ưu tiên viewpoint Priority = High trước.
- Với mỗi viewpoint, tạo test case normal/abnormal/boundary nếu phù hợp.
- Output dạng bảng với các cột:
  No, Module, Screen, Function, Viewpoint ID, Viewpoint Name, Test Type, Priority, Preconditions, Test Data, Steps, Expected Result
- Không tạo test case cho viewpoint không áp dụng.
- Nếu specification thiếu thông tin, ghi rõ Assumption.

Thông tin màn hình:
[PASTE SCREEN SPEC HERE]
```

---

# 10. Checklist sử dụng nhanh

Trước khi hoàn tất test case cho một màn hình, kiểm tra đã xem xét các nhóm sau chưa:

- [ ] Display / Initial display
- [ ] Navigation / Button action
- [ ] Preconditions đủ rõ để dựng bối cảnh test, gồm user/role, màn hình nguồn, record/row/master/session/mock cần có
- [ ] Input validation
- [ ] Search / List / Paging / Sort
- [ ] Detail / Create / Update / Delete
- [ ] Confirm / Complete
- [ ] Business rule / Status transition
- [ ] Authentication / Authorization
- [ ] Session / Browser back / Double submit
- [ ] Concurrency
- [ ] DB consistency / Transaction
- [ ] Error handling / Message
- [ ] Security: XSS / SQL Injection / CSRF / Direct URL
- [ ] File upload/download/import/export nếu có
- [ ] Date/time/number format
- [ ] Japanese-specific data
- [ ] Master data
- [ ] Logging / Audit
- [ ] Performance basic
- [ ] Browser compatibility

---

# 11. Ghi chú áp dụng thực tế

- Không phải màn hình nào cũng cần dùng toàn bộ viewpoint.
- VP-01 áp dụng cho từng visible surface, không chỉ trang chính. Nếu DD liệt kê `POP-xxx` hoặc source có modal/dialog/confirm popup, tạo testcase Screen Display riêng cho popup đó trước khi cover validation/business/delete action của nó.
- Preconditions là phần setup để tester chạy được testcase, không phải nơi lặp lại Steps. Với popup/modal/dialog mở từ một record/row/dropdown option, phải nêu record/row đã tồn tại trên màn hình, trạng thái của record/row, quyền user, màn hình/access point đang mở, session/cache/temp file/master data/mock service cần có, và ID/context còn hiệu lực nếu DD có yêu cầu.
- Tránh preconditions quá chung như `Login user hợp lệ`, `Mở popup`, `Có file row nguồn`, `Có nhiều file trong queue` khi testcase thật sự cần dữ liệu cụ thể. Viết đủ để người khác có thể chuẩn bị DB/UI trước khi chạy test mà không phải suy luận lại từ DD.
- Với màn CRUD thông thường, tối thiểu nên cover: VP-01, VP-02, VP-03, VP-04, VP-05, VP-06, VP-07, VP-15/16/17, VP-20, VP-23, VP-26, VP-28, VP-30, VP-31, VP-32, VP-34, VP-35.
- Với khách hàng Nhật, nên đặc biệt chú ý: VP-09, VP-31, VP-40, VP-41, VP-42.
- Với Spring Boot MVC + Thymeleaf, nên thêm: VP-49, VP-50 vào checklist review.
- Khi specification không rõ, không tự đoán quá sâu; ghi assumption để confirm với khách hàng hoặc BA.

