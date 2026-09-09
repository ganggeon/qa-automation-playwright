import { test, expect } from '../../fixtures/ui';
import { PRODUCT } from '../../test-data/minishop';

/**
 * 상품 목록 화면 (UI)
 *
 * 검증 대상
 *   UI-01 HTML 특수문자가 포함된 상품명이 문자 그대로 표시되는가
 *   UI-02 금액이 "15,000원" 형식으로 표시되는가
 *   UI-03 오류가 #message 영역에 표시되는가
 */

test.describe('상품 목록 화면', () => {
  test.beforeEach(async ({ loggedIn, productsPage }) => {
    await productsPage.open();
  });

  test('TC-UI-PROD-001 | [UI-02] 가격이 천 단위 콤마와 "원" 단위로 표시된다', async ({ productsPage }) => {
    const priceText = await productsPage.displayedPrice(PRODUCT.CART_ONLY.id);

    expect(priceText).toBe('33,000원');
    // 형식 자체도 검증해 둔다. 다른 상품이 추가돼도 규칙은 같아야 한다.
    expect(priceText).toMatch(/^\d{1,3}(,\d{3})*원$/);
  });

  test('TC-UI-PROD-002 | [UI-01] 상품명의 HTML 특수문자가 문자 그대로 표시된다', async ({
    productsPage,
  }) => {
    test.fail(true, 'BUG-015: 상품명을 innerHTML로 삽입하여 <div>가 태그로 해석되고 화면에서 사라진다');

    const displayed = await productsPage.displayedName(PRODUCT.HTML_NAME.id);

    expect(displayed, `화면 표시명이 원본과 다르다 (표시된 값: "${displayed}")`).toBe(
      PRODUCT.HTML_NAME.name
    );
  });

  test('TC-UI-PROD-003 | [보안] 상품명이 실제 DOM 요소로 생성되지 않는다', async ({
    productsPage,
  }) => {
    test.fail(true, 'BUG-015: 서버 데이터가 그대로 DOM 요소로 생성된다 (저장형 XSS 취약)');

    // 상품명 셀 안에 진짜 <div> 요소가 만들어졌다면, 데이터가 코드로 실행된 것이다.
    const injected = productsPage.row(PRODUCT.HTML_NAME.id).getByTestId('product-name').locator('div');

    await expect(injected, '상품명 데이터가 DOM 요소로 해석되었다').toHaveCount(0);
  });

  test('TC-UI-PROD-004 | 품절 상품은 재고 자리에 "품절"로 표시된다', async ({ productsPage }) => {
    const stockCell = productsPage.row(PRODUCT.SOLD_OUT.id).getByTestId('product-stock');
    await expect(stockCell).toHaveText('품절');
  });

  test('TC-UI-PROD-005 | 검색어를 입력하면 일치하는 상품만 표시된다', async ({ productsPage }) => {
    await productsPage.search('Java');

    await expect(productsPage.rows).toHaveCount(1);
    expect(await productsPage.displayedNames()).toEqual([PRODUCT.EXACT_30000.name]);
  });

  test('TC-UI-PROD-006 | 검색 결과가 없으면 목록이 비어 있다', async ({ productsPage }) => {
    await productsPage.search('존재하지않는상품명');
    await expect(productsPage.rows).toHaveCount(0);
  });

  test('TC-UI-PROD-007 | 상품을 담으면 성공 메시지가 표시된다', async ({ productsPage }) => {
    await productsPage.addToCart(PRODUCT.CART_ONLY.id, 1);

    await expect(productsPage.message).toBeVisible();
    await expect(productsPage.message).toHaveText('장바구니에 담았습니다.');
  });

  test('TC-UI-PROD-008 | [UI-03] 품절 상품을 담으면 오류 메시지가 표시된다', async ({
    productsPage,
  }) => {
    test.fail(true, 'BUG-009: 서버가 품절 상품을 그대로 담아 성공 메시지가 표시된다');

    await productsPage.addToCart(PRODUCT.SOLD_OUT.id, 1);

    await expect(productsPage.message).toHaveClass(/error/);
  });
});
