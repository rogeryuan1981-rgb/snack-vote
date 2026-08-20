-- Snack Vote 基礎商品庫
-- 可重複執行：相同品牌、名稱、規格的啟用商品不會再次新增。
-- 價格刻意留空，請管理者採購前依實際門市售價補充。

with seed(brand, name, category, size, source_url) as (
  values
    ('樂事', '美國經典原味洋芋片', '洋芋片', '約 90g', null),
    ('樂事', '九州岩燒海苔洋芋片', '洋芋片', '約 90g', null),
    ('華元', '波的多洋芋片－蚵仔煎口味', '洋芋片', '約 70g', null),
    ('華元', '波的多洋芋片－皮蛋豆腐風味', '洋芋片', '73g', 'https://pxbox.es.pxmart.com.tw/category/535/540/0/product/13822'),
    ('卡迪那', '小德薯－濃厚茄汁口味', '洋芋片', '36g', 'https://pxbox.es.pxmart.com.tw/category/535/540/0/product/13822'),

    ('義美', '小泡芙－牛奶口味', '餅乾', '約 57g', null),
    ('義美', '夾心酥－檸檬口味', '餅乾', '約 152g', null),
    ('奧利奧', '巧克力夾心餅乾', '餅乾', '約 119.6g', null),
    ('麗滋', '原味餅乾', '餅乾', '約 100g', null),
    ('可樂果', 'Mini豌豆酥－香脆麵口味', '餅乾', '50g', 'https://pxbox.es.pxmart.com.tw/category/535/540/0/product/13822'),

    ('義美', '葡萄QQ糖巧克球', '巧克力', '50g', 'https://pxbox.es.pxmart.com.tw/product/532308'),
    ('義美', '草莓QQ糖白巧克球', '巧克力', '50g', 'https://pxbox.es.pxmart.com.tw/product/551821'),
    ('義美', '黑可可杏仁巧克球', '巧克力', '47g', 'https://pxbox.es.pxmart.com.tw/product/358897'),
    ('明治', '夏威夷豆可可粒', '巧克力', '64g', 'https://pxbox.es.pxmart.com.tw/product/196490'),
    ('健達', '繽紛樂巧克力', '巧克力', '單條裝', null),

    ('義美', '知心水果軟糖－草莓風味', '糖果果凍', '94.5g', 'https://pxbox.es.pxmart.com.tw/product/357922'),
    ('森永', '嗨啾軟糖－綜合水果', '糖果果凍', '約 100g', null),
    ('哈瑞寶', '金熊Q軟糖', '糖果果凍', '約 100g', null),
    ('盛香珍', 'Dr.Q蒟蒻果凍－綜合水果', '糖果果凍', '約 265g', null),
    ('曼陀珠', '綜合水果軟糖', '糖果果凍', '分享包', null),

    ('旺旺', '仙貝', '米果', '分享包', null),
    ('旺旺', '雪餅', '米果', '分享包', null),
    ('北田', '蒟蒻糙米捲－蛋黃口味', '米果', '約 160g', null),
    ('喜年來', '蛋捲', '米果', '約 192g', null),
    ('義美', '糙米米果', '米果', '分享包', null),

    ('萬歲牌', '無調味綜合堅果', '堅果果乾', '約 170g', null),
    ('萬歲牌', '蜜汁腰果', '堅果果乾', '約 160g', null),
    ('盛香珍', '蒜香青豆', '堅果果乾', '約 240g', null),
    ('味彩', '綜合豆果子', '堅果果乾', '360g（24g×15包）', 'https://pxbox.es.pxmart.com.tw/product/431986'),
    ('每日優果', '綜合堅果', '堅果果乾', '隨手包', null),

    ('元本山', '味付海苔', '海苔肉乾', '分享包', null),
    ('小老板', '厚片海苔－原味', '海苔肉乾', '分享包', null),
    ('新東陽', '蜜汁豬肉乾', '海苔肉乾', '約 100g', null),
    ('快車肉乾', '特厚蜜汁豬肉乾', '海苔肉乾', '分享包', null),
    ('良澔', '片烤海苔－椒鹽口味', '海苔肉乾', '分享包', null),

    ('Cheers', '氣泡水', '飲料', '500ml', 'https://pxbox.es.pxmart.com.tw/product/2560'),
    ('御茶園', '日式綠茶－無糖', '飲料', '550ml', null),
    ('黑松', 'FIN補給飲料', '飲料', '580ml', null),
    ('可口可樂', '零卡可樂', '飲料', '600ml', null),
    ('伯朗', '藍山風味咖啡', '飲料', '240ml', null)
)
insert into public.products (
  brand, name, category, size, reference_price, source_url,
  origin, approval_status, active
)
select
  s.brand, s.name, s.category, s.size, null, s.source_url,
  'catalog', 'approved', true
from seed s
where not exists (
  select 1
  from public.products p
  where p.active
    and lower(btrim(p.brand)) = lower(btrim(s.brand))
    and lower(btrim(p.name)) = lower(btrim(s.name))
    and lower(btrim(p.size)) = lower(btrim(s.size))
);

select category, count(*) as product_count
from public.products
where active and approval_status = 'approved'
group by category
order by category;
